const menuButton = document.getElementById("menuButton");
const navLinks = document.getElementById("navLinks");

const setMenuState = (isOpen) => {
  navLinks?.classList.toggle("is-open", isOpen);
  menuButton.setAttribute("aria-expanded", String(isOpen));
};

menuButton?.addEventListener("click", () => {
  setMenuState(!navLinks?.classList.contains("is-open"));
});

navLinks?.addEventListener("click", (event) => {
  if (!(event.target instanceof HTMLAnchorElement)) return;
  setMenuState(false);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && navLinks?.classList.contains("is-open")) {
    setMenuState(false);
    menuButton?.focus();
  }
});
