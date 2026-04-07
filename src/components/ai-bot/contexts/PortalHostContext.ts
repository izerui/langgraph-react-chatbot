import { createContext, useContext } from 'react'

export const PortalHostContext = createContext<HTMLElement | null>(null)

export function usePortalHost(): HTMLElement | null {
  return useContext(PortalHostContext)
}
