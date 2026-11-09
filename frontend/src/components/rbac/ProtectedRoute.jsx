
export default function ProtectedRoute({ user, children }) {
  if (!user) return null;
  return children;
}
