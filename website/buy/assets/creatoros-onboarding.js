(() => {
  'use strict';

  const delivery = document.querySelector('#delivery');
  const reminder = document.querySelector('#redemption-download-reminder');
  if (!delivery || !reminder) return;

  // 只呈现原交付流程已经确认的成功结果，不发送交易请求或保存激活码。
  const showDownloadReminder = () => {
    const hasActivationCode = Boolean(document.querySelector('#activation-code')?.textContent.trim());
    if (delivery.classList.contains('open') && hasActivationCode && !reminder.open) {
      reminder.showModal();
    }
  };
  document.querySelector('#redemption-download-close').addEventListener('click', () => reminder.close());
  reminder.addEventListener('close', () => document.querySelector('#copy-code')?.focus());
  new MutationObserver(showDownloadReminder).observe(delivery, { attributes: true, attributeFilter: ['class'] });
  showDownloadReminder();
})();
