(function () {
  const originalFetch = window.fetch;

  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);

    try {
      const clone = response.clone();
      const data = await clone.json();

      if (Array.isArray(data) && data[0]?.expectedTurnTimeUnixTimestamp) {
        window.postMessage(
          {
            source: "QUEUE_TIMER",
            payload: data
          },
          "*"
        );
      }
    } catch {
      // ignore non-JSON
    }

    return response;
  };
})();