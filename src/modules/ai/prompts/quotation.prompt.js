// Guidance injected when the model is ready to produce a quotation.
export const QUOTATION_INSTRUCTIONS = `When generating a quotation:
- List each item with quantity and unit price (from tools).
- Show the subtotal and total in the business currency.
- State validity (e.g. "valid for 7 days") and any deposit terms.
- After presenting it, call the create_quote tool to persist it.`;

export default QUOTATION_INSTRUCTIONS;
