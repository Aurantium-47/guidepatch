const STYLE_ID = 'mimik-blur-style';
const BLUR_PX = 10;

export function injectBlurStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .mimik-blur {
      filter: blur(${BLUR_PX}px);
      transition: filter 120ms ease;
    }
    .mimik-blur.mimik-blur-peek {
      filter: none;
    }
    .mimik-manual-blur {
      filter: blur(${BLUR_PX}px);
      transition: filter 120ms ease;
    }
  `;
  document.head.appendChild(style);
}

export function removeBlurStyles() {
  document.getElementById(STYLE_ID)?.remove();
}
