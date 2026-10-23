// Local device frames. CSS pixel dimensions are design references
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);

  // The three device sizes
  const screens = {
    phone: {
      name: 'Samsung Galaxy S26 Ultra',
      width: 412,
      height: 892,
      detail: '6.9-inch reference · portrait',
      kind: 'phone',
    },
    laptop: {
      name: '14-inch laptop',
      width: 1440,
      height: 900,
      detail: '16:10 workspace',
      kind: 'laptop',
    },
    monitor: {
      name: '24-inch monitor · Full HD',
      width: 1920,
      height: 1080,
      detail: '16:9 workspace',
      kind: 'monitor',
    },
  };
  let screen = screens.laptop;

  // Frame borders and decorative space
  const dimensions = () =>
    screen.kind === 'phone'
      ? { left: 10, top: 44, right: 10, bottom: 23, extra: 0 }
      : screen.kind === 'laptop'
        ? { left: 14, top: 28, right: 14, bottom: 28, extra: 24 }
        : { left: 13, top: 13, right: 13, bottom: 30, extra: 82 };

  // Fit the device frame into the preview stage
  function layout() {
    const trim = dimensions();
    const width = screen.width + trim.left + trim.right;
    const height = screen.height + trim.top + trim.bottom;
    const stageStyle = getComputedStyle($('previewStage'));
    const availableWidth =
      $('previewStage').clientWidth -
      parseFloat(stageStyle.paddingLeft) -
      parseFloat(stageStyle.paddingRight);
    const availableHeight =
      $('previewStage').clientHeight -
      parseFloat(stageStyle.paddingTop) -
      parseFloat(stageStyle.paddingBottom);
    // Account for the laptop base extending beyond both sides of its screen.
    const overhang =
      screen.kind === 'laptop' ? 0.08 * width : screen.kind === 'phone' ? 8 : 0;
    const zoom = $('zoomMode').value;
    const scale =
      zoom === 'fit'
        ? Math.min(
            1,
            availableWidth / (width + overhang),
            availableHeight / (height + trim.extra),
          )
        : Number(zoom);
    const frame = $('deviceFrame');
    frame.className = `device-frame ${screen.kind}`;
    frame.style.width = `${width}px`;
    frame.style.height = `${height}px`;
    frame.style.transform = `scale(${scale})`;
    frame.style.left = `${(overhang * scale) / 2}px`;
    $('deviceSpace').style.width = `${(width + overhang) * scale}px`;
    $('deviceSpace').style.height = `${(height + trim.extra) * scale}px`;
    const iframe = $('appPreview');
    iframe.style.width = `${screen.width}px`;
    iframe.style.height = `${screen.height}px`;
    iframe.style.left = `${trim.left - 2}px`;
    iframe.style.top = `${trim.top - 2}px`;
    iframe.title = `Noteable interactive ${screen.name} preview`;
    $('screenReadout').textContent = `${screen.width} × ${screen.height} CSS px`;
  }

  // Switch device without reloading the notes app
  function selectDevice(next) {
    screen = screens[next];

    // Device controls and resize updates
    document
      .querySelectorAll('[data-device]')
      .forEach((button) =>
        button.setAttribute('aria-pressed', String(button.dataset.device === next)),
      );
    $('screenLabel').textContent = screen.name;
    layout();
  }
  document
    .querySelectorAll('[data-device]')
    .forEach((button) =>
      button.addEventListener('click', () => selectDevice(button.dataset.device)),
    );
  $('zoomMode').addEventListener('change', layout);
  new ResizeObserver(layout).observe($('previewStage'));
  selectDevice('laptop');
})();
