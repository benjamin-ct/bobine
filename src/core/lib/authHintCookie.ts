// Cookie compagnon de la session (voir worker/auth.ts, AUTH_HINT_COOKIE),
// lisible en JS : absent, une réponse 401 de /api/auth/me est garantie.
// L'ancien nom (bobine_auth, avant Seancy) compte encore : la session est
// alors reposée sous le nouveau nom par /api/auth/me.
export function hasAuthHintCookie(): boolean {
  return /(?:^|;\s*)(?:seancy|bobine)_auth=1(?:;|$)/.test(document.cookie);
}

// Le serveur ne peut pas toujours l'effacer lui-même (session révoquée
// ailleurs, voir AuthContext.tsx).
export function clearAuthHintCookie(): void {
  document.cookie = "seancy_auth=; Path=/; Max-Age=0";
  document.cookie = "bobine_auth=; Path=/; Max-Age=0";
}
