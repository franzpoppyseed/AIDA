# V19 motion and layout notes

This build keeps the homepage intentionally minimal and puts the application itself behind the top navigation.

## Motion system

The visual motion layer is isolated in `ui-motion.js` instead of being mixed into the learning logic in `app.js`.

It includes:

- a lightweight canvas particle field
- a cursor-following ambient light
- staged page-load reveal
- intersection-based reveal animation
- restrained 3D card tilt
- magnetic controls
- click ripples
- intermittent glitch treatment on the `間` hero mark
- subtle scroll parallax
- active-navigation syncing with open dialogs
- dialog entrance choreography
- reduced-motion support

The interface deliberately uses a small amount of lime, violet, and cyan against black rather than applying neon effects to every element.
