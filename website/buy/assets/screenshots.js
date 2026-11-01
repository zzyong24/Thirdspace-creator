/* 真实截图的键盘预览支持，购买与兑换事件继续由原store.js负责。 */
(() => {
  let opener = null;
  for (const image of document.querySelectorAll('.zoomable')) {
    image.tabIndex = 0;
    image.setAttribute('role', 'button');
    image.setAttribute('aria-label', `${image.alt}，点击放大`);
    image.addEventListener('click', () => { opener = image; });
    image.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        image.click();
      }
    });
  }
  document.querySelector('#lightbox-close').addEventListener('click', () => opener?.focus());
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && document.querySelector('#lightbox').classList.contains('open')) opener?.focus();
  });
})();
