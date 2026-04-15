const form = document.querySelector(".beta-form");
const statusMessage = document.querySelector("#signup-status");

if (form && statusMessage) {
  const submitButton = form.querySelector('button[type="submit"]');
  const defaultButtonText = submitButton?.textContent ?? "Je veux ma place";

  const setStatus = (message, type) => {
    statusMessage.textContent = message;
    statusMessage.classList.remove("is-success", "is-error");
    if (type) {
      statusMessage.classList.add(type);
    }
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const formData = new FormData(form);
    const honeypotValue = String(formData.get("bot-field") ?? "").trim();
    if (honeypotValue) {
      setStatus("Merci ! Votre inscription à la bêta est bien enregistrée.", "is-success");
      return;
    }

    const payload = new URLSearchParams();
    for (const [key, value] of formData.entries()) {
      payload.append(key, String(value));
    }

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.setAttribute("aria-disabled", "true");
      submitButton.textContent = "Inscription...";
    }
    form.setAttribute("aria-busy", "true");
    setStatus("Envoi en cours...", null);

    try {
      const response = await fetch("/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: payload.toString(),
      });

      if (!response.ok) {
        throw new Error(`Signup failed with status ${response.status}`);
      }

      form.reset();
      setStatus("Merci ! Votre inscription à la bêta est bien enregistrée.", "is-success");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("Beta signup failed:", errorMessage);
      setStatus("Une erreur est survenue. Merci de réessayer dans un instant.", "is-error");
    } finally {
      form.setAttribute("aria-busy", "false");
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.setAttribute("aria-disabled", "false");
        submitButton.textContent = defaultButtonText;
      }
    }
  });
}
