"""ECPay CheckMacValue and NewebPay TradeInfo/TradeSha. No Frappe import, so the
same rules are unit-tested here and mirrored in the Cloudflare glue (`glue/src/pay.ts`)."""

import hashlib
import json
from urllib.parse import parse_qsl, quote_plus, urlencode

_ECPAY_UNESCAPE = {"%2d": "-", "%5f": "_", "%2e": ".", "%21": "!", "%2a": "*", "%28": "(", "%29": ")"}


def ecpay_check_mac_value(params: dict, hash_key: str, hash_iv: str) -> str:
	fields = {k: v for k, v in params.items() if k != "CheckMacValue"}
	raw = "&".join(f"{k}={fields[k]}" for k in sorted(fields, key=str.lower))
	encoded = quote_plus(f"HashKey={hash_key}&{raw}&HashIV={hash_iv}").lower()
	for src, dst in _ECPAY_UNESCAPE.items():
		encoded = encoded.replace(src, dst)
	return hashlib.sha256(encoded.encode("utf-8")).hexdigest().upper()


def ecpay_verify(params: dict, hash_key: str, hash_iv: str) -> bool:
	given = (params.get("CheckMacValue") or "").upper()
	return bool(given) and given == ecpay_check_mac_value(params, hash_key, hash_iv)


def _aes(hash_key: str, hash_iv: str):
	from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

	return Cipher(algorithms.AES(hash_key.encode()), modes.CBC(hash_iv.encode()))


def newebpay_encrypt(params: dict, hash_key: str, hash_iv: str) -> str:
	from cryptography.hazmat.primitives import padding

	padder = padding.PKCS7(128).padder()
	data = padder.update(urlencode(params).encode()) + padder.finalize()
	enc = _aes(hash_key, hash_iv).encryptor()
	return (enc.update(data) + enc.finalize()).hex()


def newebpay_decrypt(trade_info: str, hash_key: str, hash_iv: str) -> dict:
	from cryptography.hazmat.primitives import padding

	dec = _aes(hash_key, hash_iv).decryptor()
	data = dec.update(bytes.fromhex(trade_info)) + dec.finalize()
	unpadder = padding.PKCS7(128).unpadder()
	text = (unpadder.update(data) + unpadder.finalize()).decode()
	try:
		return json.loads(text)
	except json.JSONDecodeError:
		return dict(parse_qsl(text))


def newebpay_trade_sha(trade_info: str, hash_key: str, hash_iv: str) -> str:
	return hashlib.sha256(f"HashKey={hash_key}&{trade_info}&HashIV={hash_iv}".encode()).hexdigest().upper()
