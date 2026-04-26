import { buildWhatsAppUrl } from "./app-config.js?v=auth5";
import { detectLanguage } from "./i18n.js?v=lang2";

const copy = {
  en: {
    open: "Help",
    title: "Droidunclock support",
    intro: "Hi. Choose a topic or write your question and I will guide you.",
    input: "Write your question...",
    send: "Send",
    whatsapp: "Talk on WhatsApp",
    close: "Close support",
    topics: [
      ["repair", "Repairs"],
      ["price", "Prices"],
      ["warranty", "Warranty"],
      ["shipping", "Shipping"],
      ["payment", "Payments"],
    ],
    answers: {
      repair: "We help with screen repair, battery replacement, charging ports, water damage diagnosis, and refurbished device questions. Send your model and issue for a clear quote.",
      price: "Prices depend on the device model and part availability. Screen repairs start from EUR 79, battery replacement from EUR 49, charging port repair from EUR 59, and water diagnosis from EUR 29.",
      warranty: "Repairs and refurbished devices include warranty coverage. The exact warranty depends on the repair or product, and we confirm it before you proceed.",
      shipping: "We support pickup or delivery where available, and the shop checkout can handle international orders.",
      payment: "Checkout supports secure card payment and PayPal. Card details are handled by the payment provider and are not stored by Droidunclock.",
      fallback: "I can help with repairs, prices, warranty, shipping, payments, or refurbished devices. For a precise answer, send the model and what happened.",
    },
  },
  pt: {
    open: "Ajuda",
    title: "Atendimento Droidunclock",
    intro: "Ola. Escolhe um tema ou escreve a tua duvida e eu ajudo.",
    input: "Escreve a tua duvida...",
    send: "Enviar",
    whatsapp: "Falar no WhatsApp",
    close: "Fechar atendimento",
    topics: [
      ["repair", "Reparacoes"],
      ["price", "Precos"],
      ["warranty", "Garantia"],
      ["shipping", "Envio"],
      ["payment", "Pagamentos"],
    ],
    answers: {
      repair: "Ajudamos com troca de ecra, bateria, porta de carregamento, diagnostico de agua e duvidas sobre recondicionados. Envia o modelo e o problema para um orcamento claro.",
      price: "Os precos dependem do modelo e da disponibilidade das pecas. Ecra desde EUR 79, bateria desde EUR 49, porta de carregamento desde EUR 59 e diagnostico de agua desde EUR 29.",
      warranty: "As reparacoes e os equipamentos recondicionados incluem garantia. A cobertura exata depende do servico ou produto e e confirmada antes de avancares.",
      shipping: "Temos recolha ou entrega quando disponivel, e o checkout da loja suporta encomendas internacionais.",
      payment: "O checkout aceita pagamento seguro com cartao e PayPal. Os dados do cartao ficam com o provedor de pagamento e nao sao guardados pela Droidunclock.",
      fallback: "Posso ajudar com reparacoes, precos, garantia, envio, pagamentos ou recondicionados. Para uma resposta precisa, envia o modelo e o que aconteceu.",
    },
  },
  nl: {
    open: "Hulp",
    title: "Droidunclock support",
    intro: "Hoi. Kies een onderwerp of schrijf je vraag en ik help je verder.",
    input: "Schrijf je vraag...",
    send: "Sturen",
    whatsapp: "Praat via WhatsApp",
    close: "Support sluiten",
    topics: [
      ["repair", "Reparaties"],
      ["price", "Prijzen"],
      ["warranty", "Garantie"],
      ["shipping", "Verzending"],
      ["payment", "Betalingen"],
    ],
    answers: {
      repair: "Wij helpen met schermreparatie, batterij vervangen, laadpoort, waterschade diagnose en vragen over refurbished toestellen. Stuur je model en probleem voor een duidelijke offerte.",
      price: "Prijzen hangen af van toestelmodel en beschikbaarheid van onderdelen. Schermreparatie vanaf EUR 79, batterij vanaf EUR 49, laadpoort vanaf EUR 59 en waterschade diagnose vanaf EUR 29.",
      warranty: "Reparaties en refurbished toestellen hebben garantie. De exacte dekking hangt af van de service of het product en bevestigen we vooraf.",
      shipping: "Ophalen of bezorgen is mogelijk waar beschikbaar, en de shop checkout ondersteunt internationale bestellingen.",
      payment: "Checkout ondersteunt veilige kaartbetaling en PayPal. Kaartgegevens worden verwerkt door de betaalprovider en niet opgeslagen door Droidunclock.",
      fallback: "Ik kan helpen met reparaties, prijzen, garantie, verzending, betalingen of refurbished toestellen. Voor een precies antwoord: stuur het model en wat er is gebeurd.",
    },
  },
  es: {
    open: "Ayuda",
    title: "Soporte Droidunclock",
    intro: "Hola. Elige un tema o escribe tu pregunta y te ayudo.",
    input: "Escribe tu pregunta...",
    send: "Enviar",
    whatsapp: "Hablar por WhatsApp",
    close: "Cerrar soporte",
    topics: [
      ["repair", "Reparaciones"],
      ["price", "Precios"],
      ["warranty", "Garantia"],
      ["shipping", "Envio"],
      ["payment", "Pagos"],
    ],
    answers: {
      repair: "Ayudamos con reparacion de pantalla, cambio de bateria, puerto de carga, diagnostico por agua y dudas sobre reacondicionados. Envia el modelo y el problema para un presupuesto claro.",
      price: "Los precios dependen del modelo y de la disponibilidad de piezas. Pantalla desde EUR 79, bateria desde EUR 49, puerto de carga desde EUR 59 y diagnostico por agua desde EUR 29.",
      warranty: "Las reparaciones y los dispositivos reacondicionados incluyen garantia. La cobertura exacta depende del servicio o producto y la confirmamos antes de avanzar.",
      shipping: "Tenemos recogida o entrega donde este disponible, y el checkout de la tienda admite pedidos internacionales.",
      payment: "El checkout acepta pago seguro con tarjeta y PayPal. Los datos de tarjeta los gestiona el proveedor de pago y Droidunclock no los guarda.",
      fallback: "Puedo ayudar con reparaciones, precios, garantia, envio, pagos o reacondicionados. Para una respuesta precisa, envia el modelo y lo que ocurrio.",
    },
  },
  fr: {
    open: "Aide",
    title: "Support Droidunclock",
    intro: "Bonjour. Choisissez un sujet ou ecrivez votre question et je vous guide.",
    input: "Ecrivez votre question...",
    send: "Envoyer",
    whatsapp: "Parler sur WhatsApp",
    close: "Fermer le support",
    topics: [
      ["repair", "Reparations"],
      ["price", "Prix"],
      ["warranty", "Garantie"],
      ["shipping", "Livraison"],
      ["payment", "Paiements"],
    ],
    answers: {
      repair: "Nous aidons avec ecran, batterie, port de charge, diagnostic eau et questions sur appareils reconditionnes. Envoyez le modele et le probleme pour un devis clair.",
      price: "Les prix dependent du modele et des pieces disponibles. Ecran a partir de EUR 79, batterie a partir de EUR 49, port de charge a partir de EUR 59 et diagnostic eau a partir de EUR 29.",
      warranty: "Les reparations et appareils reconditionnes incluent une garantie. La couverture exacte depend du service ou produit et nous la confirmons avant intervention.",
      shipping: "Retrait ou livraison possible selon disponibilite, et le checkout de la boutique accepte les commandes internationales.",
      payment: "Le checkout accepte carte securisee et PayPal. Les donnees carte sont traitees par le prestataire de paiement et ne sont pas stockees par Droidunclock.",
      fallback: "Je peux aider avec reparations, prix, garantie, livraison, paiements ou reconditionnes. Pour une reponse precise, envoyez le modele et ce qui s'est passe.",
    },
  },
  de: {
    open: "Hilfe",
    title: "Droidunclock Support",
    intro: "Hallo. Wahle ein Thema oder schreibe deine Frage und ich helfe weiter.",
    input: "Schreibe deine Frage...",
    send: "Senden",
    whatsapp: "Auf WhatsApp sprechen",
    close: "Support schliessen",
    topics: [
      ["repair", "Reparaturen"],
      ["price", "Preise"],
      ["warranty", "Garantie"],
      ["shipping", "Versand"],
      ["payment", "Zahlungen"],
    ],
    answers: {
      repair: "Wir helfen mit Display-Reparatur, Akkuwechsel, Ladebuchse, Wasserschaden-Diagnose und Fragen zu refurbished Geraeten. Sende Modell und Problem fur ein klares Angebot.",
      price: "Preise hangen vom Modell und der Teileverfugbarkeit ab. Display ab EUR 79, Akku ab EUR 49, Ladebuchse ab EUR 59 und Wasserschaden-Diagnose ab EUR 29.",
      warranty: "Reparaturen und refurbished Geraete enthalten Garantie. Die genaue Abdeckung hangt vom Service oder Produkt ab und wird vorher bestatigt.",
      shipping: "Abholung oder Lieferung ist je nach Verfugbarkeit moglich, und der Shop-Checkout unterstutzt internationale Bestellungen.",
      payment: "Checkout unterstutzt sichere Kartenzahlung und PayPal. Kartendaten werden vom Zahlungsanbieter verarbeitet und nicht von Droidunclock gespeichert.",
      fallback: "Ich kann bei Reparaturen, Preisen, Garantie, Versand, Zahlungen oder refurbished Geraeten helfen. Fur eine genaue Antwort sende Modell und was passiert ist.",
    },
  },
};

const keywordMap = {
  repair: ["repair", "screen", "battery", "charge", "water", "repar", "ecra", "bateria", "carga", "agua", "scherm", "accu", "laad", "pantalla", "ecran", "display", "akku"],
  price: ["price", "cost", "quote", "preco", "orcamento", "prijs", "kosten", "precio", "presupuesto", "prix", "devis", "preis", "angebot"],
  warranty: ["warranty", "garantia", "garantie"],
  shipping: ["shipping", "delivery", "pickup", "envio", "entrega", "recolha", "verzending", "bezorg", "recogida", "livraison", "versand", "lieferung"],
  payment: ["payment", "pay", "stripe", "paypal", "card", "pagamento", "cartao", "betaling", "pago", "tarjeta", "paiement", "karte", "zahlung"],
};

function getCopy() {
  return copy[detectLanguage()] || copy.en;
}

function detectTopic(value) {
  const text = value.toLowerCase();
  return Object.entries(keywordMap).find(([, words]) => words.some((word) => text.includes(word)))?.[0] || "fallback";
}

function createMessage(text, role = "bot") {
  const item = document.createElement("div");
  item.className = `support-chat__message support-chat__message--${role}`;
  item.textContent = text;
  return item;
}

function setupSupportChat() {
  if (document.querySelector("[data-support-chat]") || document.body.classList.contains("admin-page")) return;

  const strings = getCopy();
  const widget = document.createElement("section");
  widget.className = "support-chat";
  widget.setAttribute("data-support-chat", "");
  widget.innerHTML = `
    <button class="support-chat__launcher" type="button" aria-expanded="false">
      <span class="support-chat__launcher-icon">?</span>
      <span>${strings.open}</span>
    </button>
    <div class="support-chat__panel" aria-hidden="true">
      <div class="support-chat__header">
        <div>
          <strong>${strings.title}</strong>
          <span>${strings.intro}</span>
        </div>
        <button class="support-chat__close" type="button" aria-label="${strings.close}">x</button>
      </div>
      <div class="support-chat__messages" aria-live="polite"></div>
      <div class="support-chat__topics"></div>
      <form class="support-chat__form">
        <input type="text" name="question" placeholder="${strings.input}" autocomplete="off" />
        <button type="submit">${strings.send}</button>
      </form>
      <a class="support-chat__whatsapp" href="#" target="_blank" rel="noopener">${strings.whatsapp}</a>
    </div>
  `;

  document.body.appendChild(widget);

  const launcher = widget.querySelector(".support-chat__launcher");
  const panel = widget.querySelector(".support-chat__panel");
  const close = widget.querySelector(".support-chat__close");
  const messages = widget.querySelector(".support-chat__messages");
  const topics = widget.querySelector(".support-chat__topics");
  const form = widget.querySelector(".support-chat__form");
  const input = form.querySelector("input");
  const whatsapp = widget.querySelector(".support-chat__whatsapp");
  let lastQuestion = "";

  function setWhatsAppLink(question = "") {
    lastQuestion = question || lastQuestion;
    const lines = [
      "Hello Droidunclock, I need support from the website.",
      "",
      `Question: ${lastQuestion || "-"}`,
      "Device model:",
      "City:",
    ];
    whatsapp.href = buildWhatsAppUrl(lines.join("\n"));
  }

  function answer(topic, question = "") {
    const key = strings.answers[topic] ? topic : "fallback";
    if (question) messages.appendChild(createMessage(question, "user"));
    messages.appendChild(createMessage(strings.answers[key], "bot"));
    messages.scrollTop = messages.scrollHeight;
    setWhatsAppLink(question);
  }

  strings.topics.forEach(([topic, label]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", () => answer(topic, label));
    topics.appendChild(button);
  });

  function setOpen(isOpen) {
    launcher.setAttribute("aria-expanded", String(isOpen));
    panel.setAttribute("aria-hidden", String(!isOpen));
    widget.classList.toggle("is-open", isOpen);
    if (isOpen) window.setTimeout(() => input.focus(), 80);
  }

  launcher.addEventListener("click", () => setOpen(!widget.classList.contains("is-open")));
  close.addEventListener("click", () => setOpen(false));
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const question = input.value.trim();
    if (!question) return;
    input.value = "";
    answer(detectTopic(question), question);
  });

  messages.appendChild(createMessage(strings.intro));
  setWhatsAppLink();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", setupSupportChat);
} else {
  setupSupportChat();
}
