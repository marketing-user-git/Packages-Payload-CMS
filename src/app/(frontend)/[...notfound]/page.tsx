import { notFound } from 'next/navigation'

// Catch-all for unmatched paths. Real routes (/admin/**, /api/**) contain static
// segments, so they take precedence over this and are never swallowed by it.
// Its only job is to trigger the sibling not-found.tsx, which renders inside the
// (frontend) layout rather than forcing a synthesised root layout.
export default function NotFoundCatchAll() {
  notFound()
}
