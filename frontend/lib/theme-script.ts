/** Shared by the server layout (inline <head> script) and the client theme hook. */
export const THEME_KEY = "crc.theme";

/**
 * Runs in <head> before first paint so a saved dark preference never flashes white.
 * Light (white + red) is the default; only an explicit "dark" choice switches it.
 */
export const THEME_INIT_SCRIPT = `(function(){try{if(localStorage.getItem("${THEME_KEY}")==="dark")document.documentElement.classList.add("dark")}catch(e){}})();`;
