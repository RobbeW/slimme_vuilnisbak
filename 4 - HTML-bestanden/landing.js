const menuButton = document.getElementById("menuButton");
const navLinks = document.getElementById("navLinks");

menuButton?.addEventListener("click", () => {
  const isOpen = navLinks?.classList.toggle("is-open") ?? false;
  menuButton.setAttribute("aria-expanded", String(isOpen));
});

navLinks?.addEventListener("click", (event) => {
  if (!(event.target instanceof HTMLAnchorElement)) return;
  navLinks.classList.remove("is-open");
  menuButton?.setAttribute("aria-expanded", "false");
});
