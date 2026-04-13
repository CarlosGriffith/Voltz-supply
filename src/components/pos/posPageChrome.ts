/**
 * Layout + surface classes aligned with the POS Analytics Dashboard
 * (KPI cards: `rounded-2xl border border-gray-100 bg-white shadow-sm`).
 */
export const POS_PAGE_MAX = 'max-w-[1800px] mx-auto w-full';

export const POS_PAGE_SHELL = `${POS_PAGE_MAX} space-y-5`;

/**
 * Toolbar wrapper for quick search (reference: white bar above grid, subtle border).
 */
export const POS_SEARCH_CARD =
  'rounded-lg border border-gray-200 bg-white shadow-sm p-2 sm:p-3';

/**
 * Cream field background like enterprise data grids (#FFFBEB + amber border).
 */
export const POS_QUICK_SEARCH_INPUT =
  'w-full pl-9 pr-3 py-2.5 border border-amber-200/80 rounded-md text-sm text-gray-900 ' +
  'bg-[#FFFBEB] placeholder:text-gray-500 ' +
  'focus:outline-none focus:border-amber-300 focus:ring-1 focus:ring-amber-200/90 focus:bg-[#FFFBEB]';

/** Primary panels (line items, sidebars) — matches dashboard “card” weight */
export const POS_SURFACE_CARD =
  'rounded-2xl border border-gray-100 bg-white shadow-sm';

/** Slightly stronger lift for dense tables / primary surfaces */
export const POS_SURFACE_RAISED =
  'rounded-2xl border border-gray-100 bg-white shadow-[0_8px_30px_rgb(0,0,0,0.06)]';
