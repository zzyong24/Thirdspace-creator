(() => {
  const status = document.getElementById("creatoros-splash-status");
  const spinner = document.getElementById("creatoros-splash-spinner");
  const detail = document.getElementById("creatoros-splash-detail");
  const button = document.getElementById("creatoros-open-logs");
  window.__creatorosSplashStatus = (message) => {
    if (typeof message === "string") status.textContent = message;
  };
  window.__creatorosSplashFailure = (title, message, logsDir) => {
    spinner.style.display = "none";
    status.textContent = title || "CreatorOS 启动失败";
    detail.style.display = "block";
    detail.textContent = `${message}\n\n诊断日志：${logsDir}`;
    button.style.display = "block";
    button.onclick = async () => {
      const invoke = window.__TAURI_INTERNALS__?.invoke;
      if (typeof invoke === "function") {
        try {
          await invoke("plugin:opener|reveal_item_in_dir", { paths: [logsDir] });
          return;
        } catch {}
      }
      detail.textContent = `${message}\n\n请手动打开诊断日志：${logsDir}`;
    };
  };
})();
