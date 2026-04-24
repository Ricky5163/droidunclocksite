import { clearCart } from "./app-config.js";

const messageElement = document.getElementById("msg");
const detailElement = document.getElementById("detail");

function setMessage(message, detail = "", type = "neutral") {
  if (messageElement) {
    messageElement.textContent = message;
    messageElement.dataset.state = type;
  }

  if (detailElement) {
    detailElement.textContent = detail;
  }
}

(async function init() {
  clearCart();

  const params = new URLSearchParams(window.location.search);
  const orderId = params.get("order");
  const paypalOrderId = params.get("token");
  const hasStripeSession = params.has("session_id");

  if (paypalOrderId) {
    setMessage("A confirmar o pagamento PayPal...", "Estamos a validar a tua encomenda.", "neutral");

    try {
      const response = await fetch("/api/paypal-capture-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paypalOrderId, orderId }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "Nao foi possivel confirmar o pagamento.");
      }

      setMessage(
        "Pagamento confirmado.",
        "Receberas a confirmacao por email assim que a encomenda ficar processada.",
        "success"
      );
      return;
    } catch (error) {
      setMessage(
        "Pagamento recebido, mas a confirmacao automatica falhou.",
        error.message || "Contacta-nos para validarmos manualmente a encomenda.",
        "error"
      );
      return;
    }
  }

  if (hasStripeSession) {
    setMessage(
      "Pagamento enviado com sucesso.",
      "O Stripe devolveu-te ao site. O webhook esta a fechar a confirmacao da encomenda.",
      "success"
    );
    return;
  }

  setMessage(
    "Pedido registado.",
    "Se este retorno veio de um gateway de pagamento, a confirmacao final sera enviada por email.",
    "neutral"
  );
})();
