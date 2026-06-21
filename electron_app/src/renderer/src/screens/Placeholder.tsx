// screens/Placeholder.tsx
// A calm "coming soon" panel for nav destinations not yet built (Calendar — V2; Settings — V1 but
// not yet designed). Content-only, rendered inside the app shell's main area.
interface PlaceholderProps {
  title: string
  note?: string
}

export default function Placeholder({ title, note }: PlaceholderProps): React.JSX.Element {
  return (
    <main className="flex h-full items-center justify-center bg-paper">
      <div className="text-center">
        <h1 className="font-display text-[30px] font-medium tracking-[-0.01em] text-ink">
          {title}
        </h1>
        <p className="mt-2 text-[15px] text-muted">{note ?? 'Coming soon.'}</p>
      </div>
    </main>
  )
}
