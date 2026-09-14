/**
 * Single TipTap bundle so all extensions share one prosemirror-model copy.
 * Build: npm run build:notes
 */
export { Editor } from '@tiptap/core';
export { default as StarterKit } from '@tiptap/starter-kit';
export { Placeholder } from '@tiptap/extension-placeholder';
