import * as React from "react"

import { cn } from "@/lib/utils"

export type TableVariant = "default" | "pos"

export type TableResizableConfig = {
  /** localStorage key suffix (e.g. `pos-quotes`) */
  storageKey: string
  /**
   * When set, column widths apply on first paint (avoids layout jump). Must match the number of `<th>` in the first header row.
   */
  columnCount?: number
}

const TableVariantContext = React.createContext<TableVariant>("default")

type ResizeCtx = {
  enabled: boolean
  columnCount: number
  percents: number[]
  setPercents: React.Dispatch<React.SetStateAction<number[]>>
  beginDrag: (columnIndex: number, clientX: number) => void
} | null

const ResizableContext = React.createContext<ResizeCtx>(null)

const HeaderColIndexContext = React.createContext<{ next: () => number } | null>(null)

/** When true with variant pos, body cells use a slightly smaller record font size. */
const PosCompactRecordsContext = React.createContext(false)

/** POS: short vertical rules between header columns only (not body). */
const PosHeaderDividersContext = React.createContext(false)

function useResizableOptional() {
  return React.useContext(ResizableContext)
}

function usePosCompactRecords() {
  return React.useContext(PosCompactRecordsContext)
}

function usePosHeaderDividers() {
  return React.useContext(PosHeaderDividersContext)
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
  }
>(({ className, variant = "default", resizable, compactRecords = false, headerColumnDividers, children, ...props }, ref) => {
  const showPosHeaderDividers = variant === "pos" && headerColumnDividers !== false
  const innerRef = React.useRef<HTMLTableElement | null>(null)
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

  function loadPercentsForN(n: number): number[] {
    if (n <= 0) return []
    if (!storageFullKey) return Array.from({ length: n }, () => 100 / n)
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
    return Array.from({ length: n }, () => 100 / n)
  }

  const [colPercents, setColPercents] = React.useState<number[]>(() =>
    enabled && hintedCount && hintedCount > 0 ? loadPercentsForN(hintedCount) : []
  )
  const [columnCount, setColumnCount] = React.useState(() =>
    enabled && hintedCount && hintedCount > 0 ? hintedCount : 0
  )

  const dragRef = React.useRef<{ index: number; startX: number; startPercents: number[] } | null>(
    null
  )
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
    try {
      localStorage.setItem(storageFullKey, JSON.stringify(colPercents))
    } catch {
      /* ignore quota */
    }
  }, [enabled, storageFullKey, colPercents])

  const beginDrag = React.useCallback((columnIndex: number, clientX: number) => {
    dragRef.current = {
      index: columnIndex,
      startX: clientX,
      startPercents: [...percentsRef.current],
    }
    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"
  }, [])

  React.useEffect(() => {
    if (!enabled) return
    const minPct = 4

    const onMove = (e: MouseEvent) => {
      const d = dragRef.current
      if (!d) return
      const table = innerRef.current
      if (!table) return
      const rect = table.getBoundingClientRect()
      const w = rect.width
      if (w <= 0) return
      const dx = e.clientX - d.startX
      const deltaPct = (dx / w) * 100
      const i = d.index
      const next = [...d.startPercents]
      const a = Math.max(minPct, next[i] + deltaPct)
      const b = Math.max(minPct, next[i + 1] - deltaPct)
      next[i] = a
      next[i + 1] = b
      const s = next.reduce((x, y) => x + y, 0)
      if (s > 0) {
        const norm = next.map((x) => (x / s) * 100)
        setColPercents(norm)
      }
    }

    const onUp = () => {
      dragRef.current = null
      document.body.style.removeProperty("cursor")
      document.body.style.removeProperty("user-select")
    }

    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
    return () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
  }, [enabled])

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

  return (
    <TableVariantContext.Provider value={variant}>
      <PosHeaderDividersContext.Provider value={showPosHeaderDividers}>
      <PosCompactRecordsContext.Provider value={variant === "pos" && !!compactRecords}>
        <ResizableContext.Provider value={resizeCtx}>
        <div
          className={cn(
            variant === "pos"
              ? [
                  "relative w-full overflow-x-auto rounded-lg border border-gray-200 bg-white",
                  "shadow-sm",
                ]
              : [
                  "relative w-full overflow-x-auto rounded-2xl border border-gray-100 bg-white",
                  "shadow-[0_8px_30px_rgb(0,0,0,0.06)]",
                  "ring-1 ring-black/[0.03]",
                ]
          )}
        >
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
        </div>
        </ResizableContext.Provider>
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
          ? ["bg-[#F3F4F6]", "[&_tr]:border-b [&_tr]:border-gray-200"]
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
              "relative h-auto whitespace-nowrap px-3 py-2.5 text-left align-middle",
              "text-xs font-medium text-gray-600",
              "first:pl-4 last:pr-4",
              "bg-[#F3F4F6] hover:bg-[#F3F4F6]",
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
            "absolute inset-y-0 -right-1.5 z-30 w-3 cursor-col-resize",
            "border-0 bg-transparent p-0 shadow-none",
            "hover:bg-transparent focus:outline-none focus-visible:ring-0",
            "touch-none select-none"
          )}
          onMouseDown={(e) => {
            e.preventDefault()
            e.stopPropagation()
            resizable.beginDrag(colIndex, e.clientX)
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
