"""對這台電腦上正在跑的 ERPNext 查三筆已入帳的報價到收款。

寫法對齊 ERPNext 自己的測試：單據要已送出，發票未收是 0，稅額是 0，
收款沖的就是那張發票。連不上就略過，避免沒有這台服務的 CI 被這支測試擋下。
資料是先前真實寫進 MariaDB 的三家示範公司，這支測試只查、不重開。
"""

import json
import os
import unittest
import urllib.error
import urllib.parse
import urllib.request

URL = os.environ.get("ERPNEXT_URL", "http://127.0.0.1:8080").rstrip("/")
USER = os.environ.get("ERPNEXT_USER", "Administrator")
PASSWORD = os.environ.get("ERPNEXT_PASSWORD", "admin")

CYCLES = [
	{
		"company": "琢奧精密製造",
		"customer": "宏達機械股份有限公司",
		"tax_id": "24536801",
		"item": "SHF-20",
		"total": 1250.0,
		"quotation": "SAL-QTN-2026-00001",
		"order": "SAL-ORD-2026-00001",
		"delivery": "MAT-DN-2026-00001",
		"invoice": "ACC-SINV-2026-00001",
		"payment": "ACC-PAY-2026-00001",
		"warehouse": "Stores - ZAM",
	},
	{
		"company": "琢奧管理顧問",
		"customer": "安安商行",
		"tax_id": "24537116",
		"item": "CON-HR",
		"total": 4500.0,
		"quotation": "SAL-QTN-2026-00002",
		"order": "SAL-ORD-2026-00002",
		"delivery": None,
		"invoice": "ACC-SINV-2026-00002",
		"payment": "ACC-PAY-2026-00002",
		"warehouse": None,
	},
	{
		"company": "琢奧學院",
		"customer": "王同學",
		"tax_id": None,
		"item": "CRS-PY",
		"total": 12000.0,
		"quotation": "SAL-QTN-2026-00003",
		"order": "SAL-ORD-2026-00003",
		"delivery": None,
		"invoice": "ACC-SINV-2026-00003",
		"payment": "ACC-PAY-2026-00003",
		"warehouse": None,
	},
]


class LiveErp:
	def __init__(self):
		self.jar = urllib.request.HTTPCookieProcessor()
		self.opener = urllib.request.build_opener(self.jar)

	def ping(self):
		with self.opener.open(f"{URL}/api/method/ping", timeout=3) as res:
			body = json.loads(res.read().decode())
		if body.get("message") != "pong":
			raise AssertionError(body)

	def login(self):
		data = urllib.parse.urlencode({"usr": USER, "pwd": PASSWORD}).encode()
		req = urllib.request.Request(f"{URL}/api/method/login", data=data)
		with self.opener.open(req, timeout=10) as res:
			body = json.loads(res.read().decode())
		if body.get("message") != "Logged In":
			raise AssertionError("登入沒有成功")

	def doc(self, doctype, name):
		quoted = urllib.parse.quote(doctype)
		with self.opener.open(f"{URL}/api/resource/{quoted}/{urllib.parse.quote(name)}", timeout=15) as res:
			return json.loads(res.read().decode())["data"]

	def rows(self, doctype, filters, fields):
		query = urllib.parse.urlencode(
			{"filters": json.dumps(filters), "fields": json.dumps(fields), "limit_page_length": 20}
		)
		with self.opener.open(f"{URL}/api/resource/{urllib.parse.quote(doctype)}?{query}", timeout=15) as res:
			return json.loads(res.read().decode())["data"]


class TestLiveQuoteToCash(unittest.TestCase):
	@classmethod
	def setUpClass(cls):
		cls.erp = LiveErp()
		try:
			cls.erp.ping()
			cls.erp.login()
		except urllib.error.HTTPError as exc:
			raise AssertionError(f"ERPNext 在 {URL} 回應 {exc.code}") from exc
		except (urllib.error.URLError, TimeoutError, ConnectionError, json.JSONDecodeError) as exc:
			raise unittest.SkipTest(f"這台電腦上的 ERPNext 沒有在 {URL} 回答：{exc}") from exc

	def test_three_companies_are_paid_with_zero_tax(self):
		for cycle in CYCLES:
			with self.subTest(company=cycle["company"]):
				invoice = self.erp.doc("Sales Invoice", cycle["invoice"])
				self.assertEqual(invoice["docstatus"], 1)
				self.assertEqual(invoice["company"], cycle["company"])
				self.assertEqual(invoice["customer"], cycle["customer"])
				self.assertEqual(invoice["status"], "Paid")
				self.assertEqual(invoice["outstanding_amount"], 0)
				self.assertEqual(invoice["total_taxes_and_charges"], 0)
				self.assertEqual(invoice["grand_total"], cycle["total"])
				self.assertEqual(invoice["items"][0]["item_code"], cycle["item"])
				self.assertEqual(invoice["items"][0]["qty"], 1)

				quote = self.erp.doc("Quotation", cycle["quotation"])
				self.assertEqual(quote["docstatus"], 1)
				self.assertEqual(quote["party_name"], cycle["customer"])
				self.assertEqual(quote["status"], "Ordered")

				order = self.erp.doc("Sales Order", cycle["order"])
				self.assertEqual(order["docstatus"], 1)
				self.assertEqual(order["customer"], cycle["customer"])
				self.assertEqual(order["status"], "Completed")

				payment = self.erp.doc("Payment Entry", cycle["payment"])
				self.assertEqual(payment["docstatus"], 1)
				self.assertEqual(payment["party"], cycle["customer"])
				self.assertEqual(payment["paid_amount"], cycle["total"])
				self.assertEqual(payment["references"][0]["reference_doctype"], "Sales Invoice")
				self.assertEqual(payment["references"][0]["reference_name"], cycle["invoice"])
				self.assertEqual(payment["references"][0]["allocated_amount"], cycle["total"])

				customer = self.erp.doc("Customer", cycle["customer"])
				self.assertEqual(customer.get("tax_id") or None, cycle["tax_id"])

				gl = self.erp.rows(
					"GL Entry",
					[["voucher_no", "=", cycle["invoice"]], ["docstatus", "=", 1]],
					["debit", "credit"],
				)
				self.assertGreaterEqual(len(gl), 2)
				self.assertEqual(sum(row["debit"] for row in gl), sum(row["credit"] for row in gl))
				self.assertIn(cycle["total"], [row["debit"] for row in gl])

				if cycle["delivery"]:
					note = self.erp.doc("Delivery Note", cycle["delivery"])
					self.assertEqual(note["docstatus"], 1)
					self.assertEqual(note["status"], "Completed")
					bins = self.erp.rows(
						"Bin",
						[["item_code", "=", cycle["item"]], ["warehouse", "=", cycle["warehouse"]]],
						["actual_qty"],
					)
					self.assertEqual(bins[0]["actual_qty"], 0)
				else:
					self.assertFalse(
						self.erp.rows(
							"Delivery Note",
							[["customer", "=", cycle["customer"]], ["company", "=", cycle["company"]], ["docstatus", "=", 1]],
							["name"],
						)
					)


if __name__ == "__main__":
	unittest.main()
