import { useNavigate } from "react-router-dom";
import { resetSessionCachesOnLogout } from "@/lib/session-cache-lifecycle";
import { useAppStore } from "@/stores/app-store";

export function useLogout() {
  const navigate = useNavigate();
  const setUser = useAppStore((state) => state.setUser);

  return async () => {
    await window.biliDesk.auth.logout();
    setUser({
      mid: 0,
      name: "未登录",
      face: "",
      isLogin: false,
      isVip: false,
    });
    resetSessionCachesOnLogout();
    navigate("/login");
  };
}
