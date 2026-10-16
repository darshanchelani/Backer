export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <div className="grid min-h-screen place-items-center bg-muted/30 p-6">{children}</div>;
}
