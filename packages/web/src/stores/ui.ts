import { create } from "zustand";

type UiState = {
  sidebarOpen: boolean;
  apiKeyModalOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  setApiKeyModalOpen: (open: boolean) => void;
};

export const useUiStore = create<UiState>((set) => ({
  sidebarOpen: true,
  apiKeyModalOpen: false,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setApiKeyModalOpen: (open) => set({ apiKeyModalOpen: open }),
}));

