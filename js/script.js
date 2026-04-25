import { SITE_NAME, buildWhatsAppUrl, setupAdminLogoShortcut } from "./app-config.js?v=admin1";
import { setupLanguageSelector } from "./i18n.js?v=lang2";

const defaultMessage = [
  "Hello Droidunclock, I came from the website and need help with my phone.",
  "",
  "Device model:",
  "Service needed:",
  "City:",
  "Preferred timing:",
].join("\n");

const featuredDevices = [
  {
    name: "iPhone 13",
    condition: "Excellent",
    price: 399,
    image:
      "https://images.unsplash.com/photo-1632661674596-df8be070a5c5?auto=format&fit=crop&w=900&q=80",
  },
  {
    name: "Samsung Galaxy S22",
    condition: "Excellent",
    price: 349,
    image:
      "https://images.unsplash.com/photo-1610945265064-0e34e5519bbf?auto=format&fit=crop&w=900&q=80",
  },
  {
    name: "Google Pixel 7",
    condition: "Good",
    price: 329,
    image:
      "https://images.unsplash.com/photo-1664478546384-d57ffe74a78c?auto=format&fit=crop&w=900&q=80",
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
                </div>
                <strong>€${device.price}</strong>
              </div>
              <p class="product-card__description">Tested, cleaned, and ready for a second life.</p>
              <a class="btn btn--primary btn--block" href="shop.html">Buy Now</a>
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

document.title = `${SITE_NAME} | Fast Phone Repairs in the Netherlands`;
setupLanguageSelector();
setupAdminLogoShortcut();
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
