(() => {
  try {
    const rawTheme = localStorage.getItem("gouno-blog:theme");
    if (rawTheme === "dark") {
      document.documentElement.dataset.theme = "dark";
    }

    const rawSettings = localStorage.getItem("gouno-blog:site-settings");
    if (!rawSettings) return;

    const settings = JSON.parse(rawSettings);
    if (settings.default_seo_title || settings.site_title) {
      document.title = settings.default_seo_title || settings.site_title;
    }
    if (settings.favicon_url) {
      const favicon = document.getElementById("site-favicon");
      if (favicon) favicon.href = settings.favicon_url;
    }
    const description = settings.default_seo_description || settings.site_description;
    if (description) {
      document
        .querySelector('meta[name="description"]')
        ?.setAttribute("content", description);
    }
  } catch {
    // Cached display preferences must never block application startup.
  }
})();
