InteractionManager and FocusLoop reference
=================================

Purpose
-------

FocusLoop coordinates keyboard focus ownership for structured UI regions such
as menus, panels, modals, variable editors, and nested controls. It is not just
a tab trap. It tracks which registered region owns the current focus context,
which modal currently traps focus, how focus should move into and out of a
region, which KeyTip path is active, and which keyboard shortcuts are
available.

The public module is:

  client/common/interactionmanager.ts

The top-level singleton exported from that module is an InteractionManager. It owns focus
loop registration, focus mode, KeyTips, shortcuts, keyboard navigation, and
window bridging.

The files in:

  client/common/interactionmanager/

are internal support modules, tests, and reference docs. The main internal
pieces are:

  - focusloop.ts: FocusLoop, the handle returned by
    registerLoop()
  - loopregistry.ts: FocusLoopRegistry, loop registration and static options
  - lifecycle.ts: focusin-driven activation, active loop ownership, modal state,
    and deactivation behavior
  - keyboardnavigation.ts: Tab, arrow, Enter, and exit-key handling
  - keytipcontroller.ts: visible KeyTip labels, KeyTip paths, and KeyTip actions
  - shortcuts.ts: executable keyboard shortcut registration and dispatch

Shared styles live in this directory:

  - focusloop.css: loop-root focus behavior
  - keytips.css: visible KeyTip label styling


Core model
----------

The core invariant is:

  Focus entering a registered loop activates that loop as the active focus
  context, unless the loop is a passive keyToEnter root.

FocusLoop relies on focusin as the commit point. The public activation API
should be understood as an activation request:

  loop.activate(options)

activate() stores dynamic activation options and moves focus toward the loop.
The resulting focusin event activates the loop. If focus is already inside the
loop, the loop is activated without moving focus, except for keyToEnter root
focus where explicit activation should move to the loop's initial focus target.

Key concepts:

Registered
  The element has been registered as a loop but does not currently own focus.

Activating
  An explicit activation request is in progress. Activation options are
  temporarily held until focusin activates the loop.

Active
  The loop owns focus context. For normal loops, focus should be inside the loop
  or inside a contained active child loop. For modals, outside focus is trapped.
  If an active loop's root element receives focus, FocusLoop restores focus to
  the previous focused descendant when possible. FocusLoop first uses the
  focusin relatedTarget when it is a valid descendant, then falls back to the
  last focused descendant it has seen. The root acts as a focus controller, not
  as active content.

Modal
  A modal loop traps passive focus outside itself. Explicit pending activation
  of another modal is allowed so modal-to-modal transitions can activate
  through focusin.

keyToEnter
  The loop root is an activation point, not the loop's active content. Passive
  focus on the root does not activate the loop. Pressing Enter or calling
  loop.activate() activates the loop.

Exit selector
  A selector or element used for programmatic focus passing when a loop
  deactivates. Focus is not passed for mouse or focus-transfer deactivation.


Public API
----------

Register a loop:

  const loop = interactionManager.registerLoop(element, { level: 1 });

registerLoop() declares the focus loop. It does not move focus or activate the
loop. It returns a FocusLoop handle, which can be used for lifecycle
events and per-loop properties:

  loop.on('activate', () => {
      // optional component work
  });

  loop.on('deactivate', event => {
      event.cancel = true;
  });

Retrieve an existing registered loop:

  const loop = interactionManager.getFocusLoop(element);

Activate by normal focus:

  element.focus();

or:

  childControl.focus();

Use explicit activation when FocusLoop should choose the initial focused control, the
loop root is not the natural focus target, keyToEnter should be activated, a modal
transition is intentional, or dynamic activation options are needed:

  loop.activate({
      withMouse: false,
      exitSelector: button,
      closeFocusMode: 'keyboard',
  });

Deactivate explicitly:

  loop.deactivate({ source: 'programmatic' });

Unregister permanently:

  loop.unregister();

unregister() removes loop classes, registered listeners, and active lifecycle
references for that loop. The old FocusLoop handle is then removed;
calling activate(), deactivate(), or unregister() on it throws.

Listen for focus mode changes:

  interactionManager.on('modeChanged', transition => {
      if (transition.mode === 'keyboard') {
          // optional component work
      }
  });

modeChanged receives a FocusModeTransition containing previousMode, mode,
options, and fromBroadcast.

KeyTips and executable shortcuts are exposed as focused public controllers:

  import interactionManager, { keyTips, shortcuts } from '../common/interactionmanager';

  keyTips.register(button, { key: 'S' });
  keyTips.update();

  shortcuts.register('Ctrl+KeyS', () => save(), 'Save project');
  shortcuts.setDirection('ltr');

The named keyTips and shortcuts exports are the same controller instances owned
by the default InteractionManager singleton.


Choosing element.focus() or loop.activate()
-------------------------------------------

Prefer element.focus() when:

  - the element or child control is naturally focusable
  - no dynamic activation options are needed
  - keyToEnter is false or not set

Use loop.activate() when:

  - initial focus should be chosen by the loop
  - the loop element is not itself the control receiving focus
  - direction matters
  - exitSelector is dynamic
  - closeFocusMode is dynamic
  - the loop root has keyToEnter and should now be activated
  - a modal transition is intentional


Activation Examples
--------------

Focusable loop root:

  const panel = document.createElement('div');
  panel.tabIndex = -1;

  interactionManager.registerLoop(panel, { level: 1 });

  // This is enough. The focusin event activates the loop.
  panel.focus();

Focusable child inside a loop:

  const panel = document.createElement('div');
  const input = document.createElement('input');
  panel.append(input);

  interactionManager.registerLoop(panel, { level: 1 });

  // This also activates the loop, because focus lands inside panel.
  input.focus();

Loop root is not the natural focus target:

  const panel = document.createElement('div');
  const firstButton = document.createElement('button');
  panel.append(firstButton);

  interactionManager.registerLoop(panel, { level: 1 });

  // Ask FocusLoop to activate the loop and move focus to its initial focus target.
  interactionManager.getFocusLoop(panel).activate();

Focused child behavior:

When focus lands on a child inside a registered loop, the focusin event activates
that loop:

  input.focus();

Calling loop.activate() while focus is already inside the loop is allowed, but
it is normally only useful when refreshing dynamic activation options. It does
not move focus away from the current child.

If the active loop root later receives focus, such as from clicking a focusable
container, FocusLoop restores focus to the previous focused child when it can:

  input.focus();

  // Later, if panel itself receives focus, focus returns to input.
  panel.focus();


Options
-------

JavaScript options:

  interactionManager.registerLoop(menu, {
      level: 1,
      modal: true,
      keyToEnter: true,
      hoverFocus: true,
      allowKeyPaths: true,
      needsDeactivate: true,
      exitKeys: ['Escape'],
      exitSelector: button,
      closeFocusMode: 'keyboard',
  });

Dynamic activation options:

  loop.activate({
      withMouse: false,
      direction: 'down',
      exitSelector: button,
      closeFocusMode: 'keyboard',
  });

Static options can also be placed on the element. JavaScript options passed to
registerLoop() override attributes.

  <div fl-level="1"
       fl-modal
       fl-keyToEnter
       fl-allowKeyPaths
       fl-exitKeys="Escape Alt+ArrowUp"
       fl-exitSelector=".jmv-ribbon-tab"
       fl-closeFocusMode="default">
  </div>

Supported attributes:

  fl-level           -> level
  fl-modal           -> modal
  fl-keyToEnter      -> keyToEnter
  fl-hoverFocus      -> hoverFocus
  fl-allowKeyPaths   -> allowKeyPaths
  fl-needsDeactivate -> needsDeactivate
  fl-exitSelector    -> exitSelector
  fl-closeFocusMode  -> closeFocusMode
  fl-exitKeys        -> exitKeys

Boolean attributes are true when present. The values "false", "0", "no", and
"off" are treated as false.

registerLoop() writes the resolved level to fl-level and adds the menu-level
class onto the registered element.

The TypeScript options type for registerLoop() is IFocusLoopOptions.


Common patterns
---------------

Simple loop:

  const loop = interactionManager.registerLoop(this.el, { level: 1 });

  // Passive focus activation is enough:
  this.el.focus();

  // Or explicitly request activation:
  loop.activate();

Use for a panel or list where focus inside the region should activate keyboard
navigation for that region.

keyToEnter loop:

  const loop = interactionManager.registerLoop(list, {
      level: 2,
      keyToEnter: true,
  });

Passive root focus:

  list.focus();

does not activate list. Pressing Enter while list has focus, or calling:

  loop.activate();

activates the loop and moves focus to the initial focus target.

Modal loop:

  const loop = interactionManager.registerLoop(dialog, {
      level: 2,
      modal: true,
      exitKeys: ['Escape'],
  });

  loop.activate();

While active, passive focus outside dialog is redirected back into dialog.
Registering a modal also sets aria-modal="true" and ensures the root can
receive focus with tabindex="-1" when needed. Non-keyToEnter modal root focus
is redirected to the first focusable item inside the modal.

keyToEnter modal:

  const loop = interactionManager.registerLoop(editor, {
      level: 2,
      modal: true,
      keyToEnter: true,
      exitSelector: editor,
      exitKeys: ['Escape'],
  });

Passive focus on editor does not activate it. Explicit activation moves to the
first focusable item and commits modal mode.

Modal-to-modal transition:

  loopA.activate();
  loopB.activate();

Explicitly activating a second modal while another modal is active is allowed.
The pending activation lets the second modal activate through focusin instead of being
blocked by the first modal's focus trap. The first modal is suspended, and the
second modal becomes active. Deactivating the second modal restores the suspended
modal when it is still connected. A disconnected suspended modal is cleared
instead of being restored.

Contained child loop inside modal:

  const modalLoop = interactionManager.registerLoop(modal, { modal: true });
  interactionManager.registerLoop(child, { level: 2 });

  modalLoop.activate();
  childControl.focus();

The child loop becomes active, and the modal still traps outside focus. If the
modal root receives focus while a contained child loop is active, FocusLoop
restores focus into the child loop instead of collapsing focus ownership back
to the modal root.

Nested non-modal loops:

When focus moves from a parent loop into a contained child loop, the parent can
remain active while the child becomes the focused loop. When focus moves from a
child loop back to its parent or to a sibling, the child loop deactivates.


Deactivation and closing
------------------------

Programmatic deactivation:

  loop.deactivate({ source: 'programmatic' });

Mouse deactivation:

  loop.deactivate({ source: 'mouse' });

Focus-transfer deactivation:

  loop.deactivate({ source: 'focus-transfer' });

Only programmatic deactivation can pass focus through exitSelector. Mouse and
focus-transfer deactivations do not pass focus to the exit selector.

deactivate can cancel programmatic and focus-transfer deactivation:

  const loop = interactionManager.registerLoop(panel);

  loop.on('deactivate', event => {
      event.cancel = true;
  });

Mouse deactivation cannot be cancelled.

Use exitSelector when closing a loop should return focus to a known control:

  const loop = interactionManager.registerLoop(menu, {
      exitSelector: button,
      exitKeys: ['Escape'],
  });

  loop.deactivate({ source: 'programmatic' });

Use deactivate when deactivating a loop should close or hide UI:

  const loop = interactionManager.registerLoop(panel, {
      exitKeys: ['Escape'],
  });

  loop.on('deactivate', () => {
      panel.removeAttribute('open');
  });

New close behavior should be implemented with deactivate/activate listeners,
not registration options.

Focus moving naturally to another registered normal loop usually does not need
an explicit deactivate call. focusin reconciliation handles that.

Use loop.deactivate() when a component is explicitly closing, cancelling,
hiding, or passing focus somewhere specific.

Close a menu from a button or command:

  closeButton.addEventListener('click', () => {
      loop.deactivate({ source: 'programmatic' });
  });

Close on Escape:

  interactionManager.registerLoop(menu, {
      exitKeys: ['Escape'],
      exitSelector: openerButton,
  });

Keyboard navigation calls loop deactivation when Escape is pressed. Component code
does not need to add a separate Escape handler unless it has extra behavior.

Close a modal:

  const loop = interactionManager.registerLoop(dialog, {
      modal: true,
      exitKeys: ['Escape'],
  });

  loop.on('deactivate', () => {
      dialog.close();
  });

  loop.deactivate({ source: 'programmatic' });

Passive focus outside a modal is trapped, so modal close should normally be an
explicit deactivation request.

Hide or remove UI before focus naturally moves:

  if (panelIsOpen) {
      loop.deactivate({ source: 'programmatic' });
      panel.hidden = true;
  }

FocusLoop normally reconciles active loop state from focusin events. If an
active loop is hidden or removed before focus moves to another element,
FocusLoop may not receive a useful focusin event and may still treat the closed
loop as active. Calling deactivate() first explicitly deactivates the loop
before the DOM changes.

Mouse dismissal:

  menu.addEventListener('mouseleave', () => {
      loop.deactivate({ source: 'mouse' });
  });

Mouse deactivation cannot be cancelled and does not pass focus to exitSelector.


Keyboard navigation
-------------------

Keyboard navigation is active outside default focus mode. When focus is in a
loop:

  - Tab and Shift+Tab wrap through tabbable controls in the current loop.
  - Arrow keys move through keyboard-focusable controls by geometry.
  - [vloop="true"] scopes vertical arrow navigation.
  - [hloop="true"] scopes horizontal arrow navigation.
  - If focus is on the loop root, arrow navigation explicitly activates the loop
    and chooses the first or last focusable item based on direction.
  - Elements can block directional arrow movement with classes such as
    block-focus-up, block-focus-down, block-focus-left, and block-focus-right.

Some controls reserve specific keys for their own behavior. When the focused
control reserves a key, FocusLoop does not use that key for loop navigation or
shortcuts.

exitKeys lets keyboard navigation deactivate a loop with source
"programmatic".

  interactionManager.registerLoop(menu, {
      exitKeys: ['Escape', 'Alt+ArrowUp', 'InlineArrowLeft'],
      exitSelector: openerButton,
  });

Supported forms include normal KeyboardEvent.code values such as Escape and
ArrowUp, modifier forms such as Alt+ArrowUp and Ctrl+ArrowLeft, and inline
arrow aliases:

  InlineArrowLeft
  InlineArrowRight

Inline aliases follow text direction. In RTL, physical left/right arrows are
mapped to the opposite inline direction.


KeyTips
-------

By default, an active modal restricts modal-specific KeyTips to that modal.

Use allowKeyPaths when the modal should allow broader key-path handling:

  interactionManager.registerLoop(backstage, {
      modal: true,
      allowKeyPaths: true,
  });

KeyTip labels and actions are searched inside the active modal when one is
active. Without an active modal, KeyTip handling is document-wide.

Register KeyTips on controls that should show a visible key label during
KeyTip mode:

  keyTips.register(button, {
      key: 'S',
      action: () => save(),
      label: 'Save',
  });

Refresh KeyTips when the visible KeyTip path changes or labels need rebuilding:

  keyTips.update({ keyTipPath: 'F' });

Keyboard shortcuts
------------------

Keyboard shortcuts are executable command bindings such as Ctrl+S, F10, or
Alt+ArrowLeft. They are separate from visible KeyTips:

  shortcuts.register('Ctrl+KeyS', () => save(), 'Save project');

Modal-specific shortcuts can be registered directly through the shortcut
controller by passing the loop's modal id:

  const loop = interactionManager.registerLoop(dialog, { modal: true });
  shortcuts.register('Escape', () => closeDialog(), 'Close dialog', true, loop.modalId);


Active Loop Reactivation
--------------------

Calling activate() on an already active loop refreshes dynamic activation
options and emits activate again. This is a refresh path, not the normal
activation path.

  loop.activate({
      exitSelector: otherButton,
      closeFocusMode: 'keyboard',
  });

Use this only when the active loop's activation options need to change.


Implementation notes
--------------------

Avoid stale active loops. If focus moves outside a normal focused loop,
FocusLoop should deactivate it. Modal loops are the exception: passive outside
focus is restored into the modal.

Do not treat an active loop root as a normal focused control. Root focus is an
activation/restoration signal. Once the loop is active, focus should be on a
descendant control or in a contained active child loop.

Modal close and DOM removal should normally be explicit. Call loop.deactivate() before
hiding/removing UI when there may not be a later focusin event to reconcile
state.


Test coverage
-------------

The InteractionManager tests live in:

  client/common/interactionmanager/tests

Run with:

  node ./node_modules/vitest/vitest.mjs run common/interactionmanager/tests

The suite covers normal focusin activation, keyToEnter behavior, modal traps, modal
stacking/restoration, exit selectors, deactivate handlers, cancelled deactivations,
nested loops, active root focus restoration, unregister behavior, and
declarative attributes.
