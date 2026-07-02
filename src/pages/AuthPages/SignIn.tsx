import { useEffect } from "react";
import { useNavigate } from "react-router";
import PageMeta from "../../components/common/PageMeta";
import AuthLayout from "./AuthPageLayout";
import SignInForm from "../../components/auth/SignInForm";
import { useAuth } from "../../context/AuthContext";

export default function SignIn() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) navigate("/", { replace: true });
  }, [isAuthenticated, navigate]);

  return (
    <>
      <PageMeta
        title="Iniciar sesión | IGSS"
        description="Sistema de turnos — Instituto Guatemalteco de Seguridad Social"
      />
      <AuthLayout>
        <SignInForm />
      </AuthLayout>
    </>
  );
}
