// Shows the DropOut OS contract notice (trial ending, read-only, suspended) at the top of Desk.
$(document).on("startup", () => {
	const account = frappe.boot.dropout_account;
	if (!account || !account.message) return;
	const tone = account.locked ? "var(--red-500, #e03636)" : "var(--orange-500, #f08c00)";
	$("<div class='dropout-account-banner'>")
		.text(account.message)
		.css({ background: tone, color: "#fff", padding: "6px 16px", "font-size": "13px", "text-align": "center" })
		.prependTo("body");
});
