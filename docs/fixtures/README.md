# Merchant workspace fixtures

`synthetic-inventory-export.csv` is labelled demonstration data for exercising
the inventory-import workflow. It is not an export from an inventory provider,
provider-verified evidence, or proof of the external-source acceptance check.

In the portal, select **Inventory import**, set the source name to
`Synthetic fixture — demonstration only`, map the listed columns, and choose
**Apply stock snapshot**. Importing the same file a second time should report
no duplicate product or stock movement.

Use a real export from a named inventory system for the final acceptance run.
