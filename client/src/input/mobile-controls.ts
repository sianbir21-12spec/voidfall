import type { InputController } from './input-controller.ts';

/** Touch controls layered over the existing keyboard/mouse input model. */
export class MobileControls {
  private readonly controller: InputController;
  private readonly root: HTMLDivElement;
  private readonly stick: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  private stickPointer: number | null = null;
  private aimPointer: number | null = null;
  private stickCenter = { x: 0, y: 0 };

  constructor(controller: InputController) {
    this.controller = controller;
    this.root = document.createElement('div');
    this.root.className = 'mobile-controls';
    this.root.setAttribute('aria-label', 'Touch flight controls');

    this.stick = document.createElement('div');
    this.stick.className = 'mobile-stick';
    this.stick.innerHTML = '<span>MOVE</span>';
    this.knob = document.createElement('div');
    this.knob.className = 'mobile-stick-knob';
    this.stick.appendChild(this.knob);

    const actions = document.createElement('div');
    actions.className = 'mobile-actions';
    actions.append(
      this.makeButton('mobile-fire', 'FIRE', 'weaponPrimary'),
      this.makeButton('mobile-boost', 'BOOST', 'boost'),
    );

    const hint = document.createElement('div');
    hint.className = 'mobile-aim-hint';
    hint.textContent = 'DRAG RIGHT SIDE TO AIM';

    this.root.append(this.stick, actions, hint);
    document.body.appendChild(this.root);

    this.bindStick();
    this.bindAim();
  }

  private makeButton(
    className: string,
    label: string,
    action: 'weaponPrimary' | 'boost',
  ): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = className;
    button.type = 'button';
    button.textContent = label;
    button.setAttribute('aria-label', label);

    const set = (pressed: boolean) => {
      if (!this.controller.enabled) return;
      this.controller.input[action] = pressed;
    };

    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      set(true);
    });
    button.addEventListener('pointerup', (event) => {
      event.preventDefault();
      set(false);
    });
    button.addEventListener('pointercancel', () => set(false));
    button.addEventListener('lostpointercapture', () => set(false));
    return button;
  }

  private bindStick(): void {
    this.stick.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      this.stickPointer = event.pointerId;
      this.stick.setPointerCapture(event.pointerId);
      const rect = this.stick.getBoundingClientRect();
      this.stickCenter = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
      this.updateStick(event.clientX, event.clientY);
    });

    this.stick.addEventListener('pointermove', (event) => {
      if (event.pointerId !== this.stickPointer) return;
      event.preventDefault();
      this.updateStick(event.clientX, event.clientY);
    });

    const release = (event: PointerEvent) => {
      if (event.pointerId !== this.stickPointer) return;
      this.stickPointer = null;
      this.knob.style.transform = 'translate(-50%, -50%)';
      this.controller.input.forward = false;
      this.controller.input.backward = false;
      this.controller.input.strafeLeft = false;
      this.controller.input.strafeRight = false;
    };
    this.stick.addEventListener('pointerup', release);
    this.stick.addEventListener('pointercancel', release);
  }

  private updateStick(clientX: number, clientY: number): void {
    if (!this.controller.enabled) return;
    const dx = clientX - this.stickCenter.x;
    const dy = clientY - this.stickCenter.y;
    const radius = 62;
    const length = Math.hypot(dx, dy);
    const scale = length > radius ? radius / length : 1;
    const x = dx * scale;
    const y = dy * scale;
    this.knob.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;

    const deadzone = 0.18;
    const nx = x / radius;
    const ny = y / radius;
    this.controller.input.strafeLeft = nx < -deadzone;
    this.controller.input.strafeRight = nx > deadzone;
    this.controller.input.forward = ny < -deadzone;
    this.controller.input.backward = ny > deadzone;
  }

  private bindAim(): void {
    document.addEventListener('pointerdown', (event) => {
      if (!this.controller.enabled || event.pointerType !== 'touch') return;
      if (event.clientX < window.innerWidth * 0.42) return;
      if ((event.target as HTMLElement)?.closest('.mobile-actions')) return;
      this.aimPointer = event.pointerId;
      this.updateAim(event.clientX, event.clientY);
    }, { passive: false });

    document.addEventListener('pointermove', (event) => {
      if (event.pointerId !== this.aimPointer) return;
      event.preventDefault();
      this.updateAim(event.clientX, event.clientY);
    }, { passive: false });

    const releaseAim = (event: PointerEvent) => {
      if (event.pointerId === this.aimPointer) this.aimPointer = null;
    };
    document.addEventListener('pointerup', releaseAim);
    document.addEventListener('pointercancel', releaseAim);
  }

  private updateAim(clientX: number, clientY: number): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.controller.input.aim.mouse = {
      x: Math.max(-1, Math.min(1, (clientX / width) * 2 - 1)),
      y: Math.max(-1, Math.min(1, 1 - (clientY / height) * 2)),
    };
    this.controller.input.aim.ndc = {
      x: (clientX / width) * 2 - 1,
      y: 1 - (clientY / height) * 2,
    };

    const crosshair = document.querySelector<SVGElement>('.crosshair');
    if (crosshair) {
      crosshair.style.left = `${(clientX / width) * 100}%`;
      crosshair.style.top = `${(clientY / height) * 100}%`;
    }
  }
}
