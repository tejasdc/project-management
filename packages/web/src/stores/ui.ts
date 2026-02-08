import { create } from "zustand";

type UiState = {
  sidebarOpen: boolean;
  apiKeyModalOpen: boolean;
  quickCaptureOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  setApiKeyModalOpen: (open: boolean) => void;
  setQuickCaptureOpen: (open: boolean) => void;
};

export const useUiStore = create<UiState>((set) => ({
  sidebarOpen: true,
  apiKeyModalOpen: false,
  quickCaptureOpen: false,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setApiKeyModalOpen: (open) => set({ apiKeyModalOpen: open }),
  setQuickCaptureOpen: (open) => set({ quickCaptureOpen: open }),
}));
