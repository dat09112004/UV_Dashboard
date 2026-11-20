
// Chức năng: Thành phần giao diện (React Component ProtectedRoute) hiển thị và xử lý tương tác người dùng trong ProtectedRoute.jsx
export default function ProtectedRoute({ user, children }) {
  if (!user) return null;
  return children;
}
