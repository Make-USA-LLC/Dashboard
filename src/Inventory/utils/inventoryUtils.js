/**
 * Shared Inventory Utilities
 * Centralizes logic used across Fulfillment, BuildEngine, and Receiving
 */

/**
 * Auto-allocates bins for a given SKU and quantity.
 * Pulls from highest-stock bins first to minimize fragmentation.
 * @param {string} sku
 * @param {number|string} qtyString
 * @param {Array} itemsList - full items array from Firestore
 * @returns {Array} allocations: [{ bin, qty, error? }]
 */
export const allocateBins = (sku, qtyString, itemsList) => {
  const qty = Number(qtyString) || 0;
  if (qty <= 0 || !sku) return [];

  const item = itemsList.find(i => i.sku === sku);
  if (!item) return [];

  let remaining = qty;
  const allocs = [];

  const bins = Object.entries(item.locations || {})
    .filter(([, q]) => q > 0)
    .sort((a, b) => b[1] - a[1]); // highest stock first

  for (const [b, q] of bins) {
    if (remaining <= 0) break;
    const pull = Math.min(remaining, q);
    allocs.push({ bin: b, qty: pull });
    remaining -= pull;
  }

  if (remaining > 0) {
    allocs.push({ bin: 'Insufficient Stock', qty: remaining, error: true });
  }

  return allocs;
};

/**
 * Validates that a SKU exists in the items list.
 * @returns {object|null} item or null
 */
export const findItem = (sku, itemsList) => itemsList.find(i => i.sku === sku) || null;

/**
 * Generates a timestamped ID with a given prefix.
 * e.g. generateId('PL') => 'PL-482910'
 */
export const generateId = (prefix) => `${prefix}-${Date.now().toString().slice(-6)}`;

/**
 * Injects a print stylesheet into <head> once.
 * Call this once at app startup or in a top-level component.
 */
export const injectPrintStyles = () => {
  if (document.getElementById('inv-print-styles')) return;
  const style = document.createElement('style');
  style.id = 'inv-print-styles';
  style.innerHTML = `
    @media print {
      body * { visibility: hidden; }
      .printable-packing-list,
      .printable-packing-list * { visibility: visible; }
      .printable-packing-list {
        position: absolute;
        left: 0; top: 0;
        width: 100%;
        padding: 0 !important;
      }
      .no-print { display: none !important; }
    }
  `;
  document.head.appendChild(style);
};
