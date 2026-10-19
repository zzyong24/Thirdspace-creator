import type {NativeEditorModule} from './native-editor-contract';
export async function loadNativeEditor(editor: 'kuaitu' | 'opencut-classic' | 'doocs-md' | 'noterelay'): Promise<NativeEditorModule> {
  const path = `/reference-editors/${editor}/native/native.js`;
  return import(/* webpackIgnore: true */ path) as Promise<NativeEditorModule>;
}
