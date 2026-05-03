import { buildLoginRedirect, clearCart } from "./app-config.js?v=auth8";
import { getAccessToken, rememberRedirectAfterLogin } from "./auth-utils.js?v=auth8";
import { setupLanguageSelector, t } from "./i18n.js?v=lang2";

const messageElement = document.getElementById("msg");
const detailElement = document.getElementById("detail");
const currentLang = setupLanguageSelector();

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
  const params = new URLSearchParams(window.location.search);
  const orderId = params.get("order");
  const paypalOrderId = params.get("token");
  const hasStripeSession = params.has("session_id");

  if (paypalOrderId) {
    setMessage("Confirming PayPal payment...", "We are validating your order.", "neutral");

    try {
      const accessToken = await getAccessToken({ wait: true, timeoutMs: 1200 });
      if (!accessToken) {
        rememberRedirectAfterLogin(`success.html?order=${encodeURIComponent(orderId || "")}&token=${encodeURIComponent(paypalOrderId)}`);
        window.location.href = buildLoginRedirect("success.html");
        return;
      }

      const response = await fetch("/api/paypal-capture-order", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ paypalOrderId, orderId }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "Nao foi possivel confirmar o pagamento.");
      }

      setMessage(
        "Payment confirmed.",
        "You will receive confirmation by email when the order is processed.",
        "success"
      );
      clearCart();
      return;
    } catch (error) {
      setMessage(
        "Payment received, but automatic confirmation failed.",
        error.message || "Contact us so we can manually validate the order.",
        "error"
      );
      return;
    }
  }

  if (hasStripeSession) {
    clearCart();
    setMessage(
      "Payment sent successfully.",
      "Stripe returned you to the site. The webhook will complete the order confirmation.",
      "success"
    );
    return;
  }

  setMessage(
    t("successTitle", currentLang),
    "If this return came from a payment provider, final confirmation will be sent by email.",
    "neutral"
  );
})();
