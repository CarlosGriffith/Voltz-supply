import * as React from "react"

import { usePosColumnResizeSuspendRef } from "@/contexts/PosColumnResizeSuspendContext"
import { cn } from "@/lib/utils"

export type TableVariant = "default" | "pos"

export type TableResizableConfig = {
  /** localStorage key suffix (e.g. `pos-quotes`) */
  storageKey: string
  /**
   * When set, column widths apply on first paint (avoids layout jump). Must match the number of `<th>` in the first header row.
   */
  columnCount?: number
  /**
   * Used when no saved widths exist in localStorage (or saved data is invalid). Positive numbers in any scale;
   * they are normalized to sum to 100%. Must match `columnCount` / measured `<th>` count when applied.
   */
  defaultPercents?: number[]
}

const TableVariantContext = React.createContext<TableVariant>("default")

type ResizeCtx = {
  enabled: boolean
  columnCount: number
  percents: number[]
  setPercents: React.Dispatch<React.SetStateAction<number[]>>
  beginDrag: (
    columnIndex: number,
    clientX: number,
    pointerId: number,
    captureTarget: HTMLElement,
    pointerType: string
  ) => void
} | null

const ResizableContext = React.createContext<ResizeCtx>(null)

const HeaderColIndexContext = React.createContext<{ next: () => number } | null>(null)

/** When true with variant pos, body cells use a slightly smaller record font size. */
const PosCompactRecordsContext = React.createContext(false)

/** POS: short vertical rules between header columns only (not body). */
const PosHeaderDividersContext = React.createContext(false)

/** POS: Quote Requests — extra header wrapping on narrow viewports (see `autoLayoutMobile`). */
const PosAutoLayoutMobileContext = React.createContext(false)

function usePosAutoLayoutMobile() {
  return React.useContext(PosAutoLayoutMobileContext)
}

function useResizableOptional() {
  return React.useContext(ResizableContext)
}

function usePosCompactRecords() {
  return React.useContext(PosCompactRecordsContext)
}

function usePosHeaderDividers() {
  return React.useContext(PosHeaderDividersContext)
}

/** Imperative col widths — avoids React re-rendering the whole table on every pointermove during resize. */
function applyColWidthsToTableDom(table: HTMLTableElement | null, percents: number[]) {
  if (!table || percents.length === 0) return
  const cols = table.querySelectorAll(":scope > colgroup > col")
  percents.forEach((p, i) => {
    const el = cols[i] as HTMLTableColElement | undefined
    if (el) el.style.width = `${p}%`
  })
}

/** Stops iOS/WebKit from scrolling the POS overflow pane (and page) while resizing columns. */
function applyPosResizeTouchLock(scrollEl: HTMLDivElement | null) {
  scrollEl?.style.setProperty("touch-action", "none")
  document.body.style.setProperty("touch-action", "none")
  document.documentElement.style.setProperty("touch-action", "none")
}

function clearPosResizeTouchLock(scrollEl: HTMLDivElement | null) {
  scrollEl?.style.removeProperty("touch-action")
  document.body.style.removeProperty("touch-action")
  document.documentElement.style.removeProperty("touch-action")
}

const Table = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement> & {
    variant?: TableVariant
    /** POS tables: drag vertical dividers in header to resize; widths persist in localStorage */
    resizable?: TableResizableConfig
    /** Smaller text for data rows (headers unchanged). */
    compactRecords?: boolean
    /**
     * POS only: show vertical rules between header columns (75% height, vertically centered).
     * Defaults to on for `variant="pos"`; pass `false` to disable.
     */
    headerColumnDividers?: boolean
    /**
     * POS + resizable: on viewports below `sm`, allow header text to wrap (`whitespace-normal`) so
     * labels stay readable; data column mins stay in page markup. Layout still uses `table-fixed` +
     * `%` colgroup so column drag resize works on phones (pointer events).
     */
    autoLayoutMobile?: boolean
  }
>(({ className, variant = "default", resizable, compactRecords = false, headerColumnDividers, autoLayoutMobile = false, children, ...props }, ref) => {
  const posRealtimeSuspendRef = usePosColumnResizeSuspendRef()
  const showPosHeaderDividers = variant === "pos" && headerColumnDividers !== false
  const innerRef = React.useRef<HTMLTableElement | null>(null)
  /** POS scroll wrapper — iOS needs `touch-action` + touch listeners so resize isn’t stolen by overflow scroll. */
  const posScrollContainerRef = React.useRef<HTMLDivElement | null>(null)
  const setRefs = React.useCallback(
    (node: HTMLTableElement | null) => {
      innerRef.current = node
      if (typeof ref === "function") ref(node)
      else if (ref) (ref as React.MutableRefObject<HTMLTableElement | null>).current = node
    },
    [ref]
  )

  const storageFullKey = resizable?.storageKey
    ? `pos-table-cols-v2:${resizable.storageKey}`
    : null

  const enabled = variant === "pos" && !!resizable?.storageKey
  const hintedCount = resizable?.columnCount
  const defaultPercents = resizable?.defaultPercents

  function normalizePercentsTo100(values: number[]): number[] {
    const sum = values.reduce((a, b) => a + b, 0)
    if (sum <= 0) return Array.from({ length: values.length }, () => 100 / values.length)
    return values.map((x) => (x / sum) * 100)
  }

  function fallbackPercentsForN(n: number): number[] {
    if (n <= 0) return []
    if (defaultPercents && defaultPercents.length === n) {
      return normalizePercentsTo100(defaultPercents)
    }
    return Array.from({ length: n }, () => 100 / n)
  }

  function loadPercentsForN(n: number): number[] {
    if (n <= 0) return []
    if (!storageFullKey) return fallbackPercentsForN(n)
    try {
      const raw = localStorage.getItem(storageFullKey)
      if (raw) {
        const parsed = JSON.parse(raw) as unknown
        if (Array.isArray(parsed) && parsed.length === n && parsed.every((x) => typeof x === "number")) {
          const sum = parsed.reduce((a: number, b: number) => a + b, 0)
          if (sum > 0) {
            return parsed.map((x: number) => (x / sum) * 100)
          }
        }
      }
    } catch {
      /* ignore */
    }
    return fallbackPercentsForN(n)
  }

  const [colPercents, setColPercents] = React.useState<number[]>(() =>
    enabled && hintedCount && hintedCount > 0 ? loadPercentsForN(hintedCount) : []
  )
  const [columnCount, setColumnCount] = React.useState(() =>
    enabled && hintedCount && hintedCount > 0 ? hintedCount : 0
  )

  const dragRef = React.useRef<{
    index: number
    startX: number
    startPercents: number[]
    pointerId: number
  } | null>(null)
  /** True while a column divider drag is active — blocks localStorage writes; DOM-only width updates. */
  const columnResizeActiveRef = React.useRef(false)
  /** Latest normalized % widths during drag (committed to React state on pointerup only). */
  const resizeDragLatestRef = React.useRef<number[] | null>(null)
  /** Batches `<col>` width writes to one layout pass per animation frame during drag. */
  const resizeRafRef = React.useRef<number | null>(null)
  /** Element that called `setPointerCapture` — released on drag end / lost capture. */
  const pointerCaptureTargetRef = React.useRef<HTMLElement | null>(null)
  /** Touch drags use `touchmove` for coordinates; skip redundant `pointermove` on iOS WebKit. */
  const dragPointerKindRef = React.useRef<"touch" | "mouse" | null>(null)

  const percentsRef = React.useRef<number[]>([])
  percentsRef.current = colPercents

  const prevColCountRef = React.useRef(0)
  const colLenRef = React.useRef(0)
  colLenRef.current = colPercents.length

  React.useLayoutEffect(() => {
    prevColCountRef.current = 0
  }, [storageFullKey])

  const measureColumns = React.useCallback(() => {
    if (!enabled || !storageFullKey) return
    if (hintedCount && hintedCount > 0) return
    const table = innerRef.current
    if (!table) return
    const ths = table.querySelectorAll(":scope > thead > tr:first-child > th")
    const n = ths.length
    if (n === 0) return
    if (n === prevColCountRef.current && colLenRef.current === n) return
    prevColCountRef.current = n
    setColumnCount(n)
    setColPercents(loadPercentsForN(n))
  }, [enabled, storageFullKey, hintedCount])

  React.useLayoutEffect(() => {
    measureColumns()
  }, [measureColumns, children])

  React.useEffect(() => {
    if (!enabled || !storageFullKey || colPercents.length === 0) return
    if (columnResizeActiveRef.current) return
    try {
      localStorage.setItem(storageFullKey, JSON.stringify(colPercents))
    } catch {
      /* ignore quota */
    }
  }, [enabled, storageFullKey, colPercents])

  /**
   * Parent re-renders can reset `<col style>` from React while the gesture is DOM-driven — re-apply
   * the latest drag widths after commit (cheap: only runs meaningful work when a drag is active).
   */
  React.useLayoutEffect(() => {
    if (!enabled || !columnResizeActiveRef.current) return
    const pct = resizeDragLatestRef.current
    if (!pct?.length || !innerRef.current) return
    applyColWidthsToTableDom(innerRef.current, pct)
  })

  const beginDrag = React.useCallback(
    (
      columnIndex: number,
      clientX: number,
      pointerId: number,
      captureTarget: HTMLElement,
      pointerType: string
    ) => {
      if (posRealtimeSuspendRef) posRealtimeSuspendRef.current = true
      if (resizeRafRef.current != null) {
        cancelAnimationFrame(resizeRafRef.current)
        resizeRafRef.current = null
      }
      dragPointerKindRef.current = pointerType === "touch" ? "touch" : "mouse"
      applyPosResizeTouchLock(posScrollContainerRef.current)
      pointerCaptureTargetRef.current = captureTarget
      columnResizeActiveRef.current = true
      const start = [...percentsRef.current]
      resizeDragLatestRef.current = start
      dragRef.current = {
        index: columnIndex,
        startX: clientX,
        startPercents: start,
        pointerId,
      }
      document.body.style.cursor = "col-resize"
      document.body.style.userSelect = "none"
    },
    [posRealtimeSuspendRef]
  )

  React.useEffect(() => {
    if (!enabled) return
    const minPct = 4

    const flushPendingResizeRaf = () => {
      if (resizeRafRef.current != null) {
        cancelAnimationFrame(resizeRafRef.current)
        resizeRafRef.current = null
      }
      const table = innerRef.current
      const pct = resizeDragLatestRef.current
      if (table && pct?.length) applyColWidthsToTableDom(table, pct)
    }

    const scheduleResizeApply = () => {
      if (resizeRafRef.current != null) return
      resizeRafRef.current = requestAnimationFrame(() => {
        resizeRafRef.current = null
        const table = innerRef.current
        const pct = resizeDragLatestRef.current
        if (table && pct?.length) applyColWidthsToTableDom(table, pct)
      })
    }

    const releaseCaptureIfNeeded = (pointerId: number) => {
      const el = pointerCaptureTargetRef.current
      pointerCaptureTargetRef.current = null
      if (!el || typeof el.releasePointerCapture !== "function") return
      try {
        if (typeof el.hasPointerCapture === "function" && el.hasPointerCapture(pointerId)) {
          el.releasePointerCapture(pointerId)
        }
      } catch {
        /* ignore */
      }
    }

    const applyResizeFromClientX = (clientX: number) => {
      const d = dragRef.current
      if (!d) return
      const table = innerRef.current
      if (!table) return
      const rect = table.getBoundingClientRect()
      const w = rect.width
      if (w <= 0) return
      const dx = clientX - d.startX
      const deltaPct = (dx / w) * 100
      const i = d.index
      const next = [...d.startPercents]
      const a = Math.max(minPct, next[i] + deltaPct)
      const b = Math.max(minPct, next[i + 1] - deltaPct)
      next[i] = a
      next[i + 1] = b
      const s = next.reduce((x, y) => x + y, 0)
      if (s <= 0) return
      const norm = next.map((x) => (x / s) * 100)
      resizeDragLatestRef.current = norm
      scheduleResizeApply()
    }

    const finishDrag = (e: Pick<PointerEvent, "pointerId">) => {
      const d = dragRef.current
      if (!d || e.pointerId !== d.pointerId) return
      flushPendingResizeRaf()
      const pending = resizeDragLatestRef.current
      if (pending) setColPercents(pending)
      resizeDragLatestRef.current = null

      dragRef.current = null
      dragPointerKindRef.current = null
      columnResizeActiveRef.current = false
      clearPosResizeTouchLock(posScrollContainerRef.current)
      if (posRealtimeSuspendRef) posRealtimeSuspendRef.current = false
      document.body.style.removeProperty("cursor")
      document.body.style.removeProperty("user-select")
      releaseCaptureIfNeeded(e.pointerId)
    }

    const onMove = (e: PointerEvent) => {
      const d = dragRef.current
      if (!d || e.pointerId !== d.pointerId) return
      if (dragPointerKindRef.current === "touch" && e.pointerType === "touch") {
        return
      }
      applyResizeFromClientX(e.clientX)
    }

    const onTouchMove = (e: TouchEvent) => {
      if (dragPointerKindRef.current !== "touch" || !dragRef.current) return
      if (e.touches.length !== 1) return
      e.preventDefault()
      applyResizeFromClientX(e.touches[0].clientX)
    }

    const onTouchEndOrCancel = (e: TouchEvent) => {
      if (dragPointerKindRef.current !== "touch" || !dragRef.current) return
      if (e.touches.length > 0) return
      finishDrag({ pointerId: dragRef.current.pointerId })
    }

    const endDrag = (e: PointerEvent) => {
      finishDrag(e)
    }

    const onLostPointerCapture = (e: Event) => {
      const pe = e as PointerEvent
      finishDrag(pe)
    }

    const moveOpts: AddEventListenerOptions = { passive: true, capture: true }
    const capOpts: AddEventListenerOptions = { capture: true }
    const touchMoveOpts: AddEventListenerOptions = { passive: false, capture: true }
    document.addEventListener("pointermove", onMove, moveOpts)
    document.addEventListener("pointerup", endDrag, capOpts)
    document.addEventListener("pointercancel", endDrag, capOpts)
    document.addEventListener("lostpointercapture", onLostPointerCapture, capOpts)
    document.addEventListener("touchmove", onTouchMove, touchMoveOpts)
    document.addEventListener("touchend", onTouchEndOrCancel, capOpts)
    document.addEventListener("touchcancel", onTouchEndOrCancel, capOpts)
    return () => {
      document.removeEventListener("pointermove", onMove, moveOpts)
      document.removeEventListener("pointerup", endDrag, capOpts)
      document.removeEventListener("pointercancel", endDrag, capOpts)
      document.removeEventListener("lostpointercapture", onLostPointerCapture, capOpts)
      document.removeEventListener("touchmove", onTouchMove, touchMoveOpts)
      document.removeEventListener("touchend", onTouchEndOrCancel, capOpts)
      document.removeEventListener("touchcancel", onTouchEndOrCancel, capOpts)
      if (resizeRafRef.current != null) {
        cancelAnimationFrame(resizeRafRef.current)
        resizeRafRef.current = null
      }
      dragRef.current = null
      dragPointerKindRef.current = null
      resizeDragLatestRef.current = null
      pointerCaptureTargetRef.current = null
      columnResizeActiveRef.current = false
      clearPosResizeTouchLock(posScrollContainerRef.current)
      if (posRealtimeSuspendRef) posRealtimeSuspendRef.current = false
      document.body.style.removeProperty("cursor")
      document.body.style.removeProperty("user-select")
    }
  }, [enabled, posRealtimeSuspendRef])

  const resizeCtx = React.useMemo((): ResizeCtx => {
    if (!enabled || columnCount === 0 || colPercents.length !== columnCount) return null
    return {
      enabled: true,
      columnCount,
      percents: colPercents,
      setPercents: setColPercents,
      beginDrag,
    }
  }, [enabled, columnCount, colPercents, beginDrag])

  const showColgroup = enabled && colPercents.length === columnCount && columnCount > 0

  const tableNode = (
    <table
      ref={setRefs}
      className={cn(
        "w-full caption-bottom border-collapse text-sm",
        variant === "pos" && "table-fixed",
        variant === "pos" && (compactRecords ? "text-[13px]" : "text-sm"),
        className
      )}
      {...props}
    >
      {showColgroup ? (
        <colgroup>
          {colPercents.map((p, i) => (
            <col key={i} style={{ width: `${p}%` }} />
          ))}
        </colgroup>
      ) : null}
      {children}
    </table>
  )

  return (
    <TableVariantContext.Provider value={variant}>
      <PosHeaderDividersContext.Provider value={showPosHeaderDividers}>
      <PosCompactRecordsContext.Provider value={variant === "pos" && !!compactRecords}>
        <PosAutoLayoutMobileContext.Provider value={variant === "pos" && autoLayoutMobile}>
        <ResizableContext.Provider value={resizeCtx}>
        <div
          className={cn(
            variant === "pos"
              ? [
                  "relative w-full min-w-0 max-w-full overflow-hidden rounded-lg border border-gray-200 bg-white",
                  "shadow-sm",
                ]
              : [
                  "relative w-full overflow-x-auto rounded-2xl border border-gray-100 bg-white",
                  "shadow-[0_8px_30px_rgb(0,0,0,0.06)]",
                  "ring-1 ring-black/[0.03]",
                ]
          )}
        >
          {variant === "pos" ? (
            <div
              ref={posScrollContainerRef}
              className={cn(
                "max-h-[min(72dvh,calc(100dvh-12rem))] w-full min-h-0 max-w-full overflow-auto overscroll-contain",
                "sm:max-h-[min(74dvh,calc(100dvh-11.5rem))] lg:max-h-[min(78dvh,calc(100dvh-10.5rem))]"
              )}
            >
              {tableNode}
            </div>
          ) : (
            tableNode
          )}
        </div>
        </ResizableContext.Provider>
        </PosAutoLayoutMobileContext.Provider>
      </PosCompactRecordsContext.Provider>
      </PosHeaderDividersContext.Provider>
    </TableVariantContext.Provider>
  )
})
Table.displayName = "Table"

function useTableVariant(): TableVariant {
  return React.useContext(TableVariantContext)
}

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => {
  const v = useTableVariant()
  const idxRef = React.useRef(0)
  idxRef.current = 0
  const ctx = React.useMemo(() => ({ next: () => idxRef.current++ }), [])

  const inner = (
    <thead
      ref={ref}
      className={cn(
        v === "pos"
          ? ["bg-[#FAFAFB]", "[&_tr]:border-b [&_tr]:border-gray-200"]
          : [
              "bg-gradient-to-b from-gray-50 via-gray-50 to-gray-100/90",
              "[&_tr]:border-b [&_tr]:border-gray-200/80",
            ],
        className
      )}
      {...props}
    />
  )

  if (v !== "pos") return inner

  return <HeaderColIndexContext.Provider value={ctx}>{inner}</HeaderColIndexContext.Provider>
})
TableHeader.displayName = "TableHeader"

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => {
  const v = useTableVariant()
  return (
    <tbody
      ref={ref}
      className={cn(
        "[&_tr:last-child]:border-0",
        v === "pos" && "[&_tr:hover]:bg-gray-50/70",
        className
      )}
      {...props}
    />
  )
})
TableBody.displayName = "TableBody"

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn(
      "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
      className
    )}
    {...props}
  />
))
TableFooter.displayName = "TableFooter"

const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => {
  const v = useTableVariant()
  return (
    <tr
      ref={ref}
      className={cn(
        v === "pos"
          ? ["border-b border-gray-100 bg-white transition-colors duration-150"]
          : [
              "border-b border-gray-100/95 transition-colors duration-150",
              "hover:bg-gray-50/95",
            ],
        "data-[state=selected]:bg-muted/80",
        className
      )}
      {...props}
    />
  )
})
TableRow.displayName = "TableRow"

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, children, ...props }, ref) => {
  const v = useTableVariant()
  const resizable = useResizableOptional()
  const headerDividers = usePosHeaderDividers()
  const autoLayoutMobile = usePosAutoLayoutMobile()
  const headIdx = React.useContext(HeaderColIndexContext)
  const colIndex = v === "pos" && headIdx ? headIdx.next() : -1
  const showResize =
    resizable?.enabled &&
    colIndex >= 0 &&
    colIndex < resizable.columnCount - 1

  return (
    <th
      ref={ref}
      className={cn(
        v === "pos"
          ? [
              "sticky top-0 z-20",
              "relative h-auto px-3 py-2.5 text-left align-middle",
              autoLayoutMobile ? "max-sm:whitespace-normal sm:whitespace-nowrap" : "whitespace-nowrap",
              "text-xs font-medium text-gray-600",
              "first:pl-4 last:pr-4",
              "bg-[#FAFAFB] hover:bg-[#FAFAFB]",
              "shadow-[inset_0_-1px_0_0_rgb(229,231,235)]",
              showResize && "pr-2",
              headerDividers &&
                "after:pointer-events-none after:absolute after:right-0 after:top-1/2 after:z-[5] after:block after:h-3/4 after:w-px after:-translate-y-1/2 after:bg-gray-200 after:content-[''] last:after:hidden [&:has([role=checkbox])]:after:hidden",
            ]
          : [
              "h-auto whitespace-nowrap px-4 py-3.5 text-left align-middle",
              "text-[11px] font-semibold uppercase tracking-wider text-gray-500",
              "first:pl-6 last:pr-6",
            ],
        "[&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    >
      {children}
      {showResize ? (
        <button
          type="button"
          tabIndex={-1}
          aria-label="Drag to resize column"
          title="Drag to resize column"
          className={cn(
            "absolute inset-y-0 -right-1.5 z-30 cursor-col-resize",
            "w-3 max-sm:w-4 max-sm:-right-2",
            "border-0 bg-transparent p-0 shadow-none",
            "hover:bg-transparent focus:outline-none focus-visible:ring-0",
            "touch-none select-none"
          )}
          onPointerDown={(e) => {
            e.preventDefault()
            e.stopPropagation()
            if (e.pointerType !== "touch") {
              e.currentTarget.setPointerCapture(e.pointerId)
            }
            resizable.beginDrag(colIndex, e.clientX, e.pointerId, e.currentTarget, e.pointerType)
          }}
        />
      ) : null}
    </th>
  )
})
TableHead.displayName = "TableHead"

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => {
  const v = useTableVariant()
  const compactRecords = usePosCompactRecords()
  return (
    <td
      ref={ref}
      className={cn(
        v === "pos"
          ? [
              "px-3 py-2.5 align-middle text-gray-800",
              compactRecords ? "text-[13px]" : "text-sm",
              "first:pl-4 last:pr-4",
            ]
          : ["px-4 py-3 align-middle first:pl-6 last:pr-6"],
        "[&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
})
TableCell.displayName = "TableCell"

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn("mt-4 text-sm text-muted-foreground", className)}
    {...props}
  />
))
TableCaption.displayName = "TableCaption"

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
