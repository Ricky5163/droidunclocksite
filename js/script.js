import { SITE_NAME, buildWhatsAppUrl, formatEuro, setupAdminLogoShortcut } from "./app-config.js?v=auth5";
import { syncAccountLinks } from "./auth-utils.js?v=auth6";
import { setupLanguageSelector } from "./i18n.js?v=lang2";

const defaultMessage = [
  "Hello Droidunclock, I came from the website and need help choosing a refurbished phone.",
  "",
  "Preferred model:",
  "Budget:",
  "City:",
].join("\n");

const featuredDevices = [
  {
    name: "iPhone 12 128GB",
    condition: "Excellent",
    battery: "89% battery",
    price: 399,
    image: "https://images.unsplash.com/photo-1603891128711-11b4b03bb138?auto=format&fit=crop&w=900&q=80",
  },
  {
    name: "Samsung Galaxy S22 128GB",
    condition: "Excellent",
    battery: "90% battery",
    price: 349,
    image: "https://images.unsplash.com/photo-1610945265064-0e34e5519bbf?auto=format&fit=crop&w=900&q=80",
  },
  {
    name: "iPhone 13 128GB",
    condition: "As new",
    battery: "91% battery",
    price: 499,
    image: "https://images.unsplash.com/photo-1632661674596-df8be070a5c5?auto=format&fit=crop&w=900&q=80",
  },
];

function setWhatsAppLinks() {
  const url = buildWhatsAppUrl(defaultMessage);
  document.querySelectorAll("[data-whatsapp-link]").forEach((link) => {
    link.href = url;
  });
}

function setupMenu() {
  const button = document.getElementById("menuBtn");
  const nav = document.getElementById("mobileNav");
  if (!button || !nav) return;

  button.addEventListener("click", () => {
    const isOpen = nav.classList.toggle("is-open");
    button.setAttribute("aria-expanded", String(isOpen));
    nav.setAttribute("aria-hidden", String(!isOpen));
  });

  nav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      nav.classList.remove("is-open");
      button.setAttribute("aria-expanded", "false");
      nav.setAttribute("aria-hidden", "true");
    });
  });
}

function setupQuickForm() {
  const form = document.getElementById("quickForm");
  if (!form) return;

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const data = new FormData(form);
    const model = String(data.get("model") || "").trim();
    const service = String(data.get("service") || "").trim();
    const notes = String(data.get("notes") || "").trim();

    const message = [
      "Hello Droidunclock, I would like a repair quote.",
      "",
      `Device model: ${model}`,
      `Service needed: ${service}`,
      `Notes: ${notes || "-"}`,
      "",
      "Please let me know the price and earliest availability.",
    ].join("\n");

    window.open(buildWhatsAppUrl(message), "_blank", "noopener");
  });
}

function setupRepairLinks() {
  document.querySelectorAll("[data-repair-request]").forEach((link) => {
    const service = link.getAttribute("data-repair-request");
    const message = [
      "Hello Droidunclock, I would like to request a repair.",
      "",
      `Service needed: ${service}`,
      "Device model:",
      "City:",
      "Preferred timing:",
    ].join("\n");

    link.href = buildWhatsAppUrl(message);
    link.target = "_blank";
    link.rel = "noopener";
  });
}

function renderFeaturedProducts() {
  const grid = document.getElementById("featuredProducts");
  const skeletons = document.getElementById("productSkeletons");
  if (!grid) return;

  window.setTimeout(() => {
    grid.innerHTML = featuredDevices
      .map(
        (device) => `
          <article class="product-card product-card--featured reveal">
            <div class="product-card__media">
              <img class="product-card__image" src="${device.image}" alt="${device.name}" loading="lazy" />
            </div>
            <div class="product-card__body">
              <div class="product-card__head">
                <div>
                  <span class="availability availability--ok">${device.condition}</span>
                  <h3>${device.name}</h3>
                  <p class="product-meta">Refurbished - ${device.battery} - 6-month warranty</p>
                </div>
                <strong>${formatEuro(device.price)}</strong>
              </div>
              <p class="product-card__description">Fully tested, unlocked, cleaned, and ready for fast delivery in the Netherlands.</p>
              <a class="btn btn--primary btn--block" href="shop.html">View Products</a>
            </div>
          </article>
        `,
      )
      .join("");

    skeletons?.classList.add("hidden");
    revealVisibleElements();
    window.lucide?.createIcons();
  }, 550);
}

function setupRevealAnimations() {
  const elements = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window)) {
    elements.forEach((element) => element.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.14 },
  );

  elements.forEach((element) => observer.observe(element));
}

function revealVisibleElements() {
  document.querySelectorAll(".reveal").forEach((element) => {
    const rect = element.getBoundingClientRect();
    if (rect.top < window.innerHeight) {
      element.classList.add("is-visible");
    }
  });
}

function setCurrentYear() {
  const year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());
}

if (!document.body.dataset.keepTitle) {
  document.title = `${SITE_NAME} | Refurbished Phones in the Netherlands`;
}
setupLanguageSelector();
setupAdminLogoShortcut();
syncAccountLinks().catch(() => null);
setWhatsAppLinks();
setupMenu();
setupQuickForm();
setupRepairLinks();
setupRevealAnimations();
renderFeaturedProducts();
setCurrentYear();

window.addEventListener("load", () => {
  revealVisibleElements();
  window.lucide?.createIcons();
});
