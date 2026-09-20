"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Catches runtime failures inside the WebGL scene.
 *
 * A lost context, a shader compile failure or a bad driver throws during
 * render and would otherwise blank the whole page. Degrading to the 2D
 * fallback keeps the HUD and the underlying data usable.
 */
export class SceneErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Globe scene failed, falling back to 2D view", error, info);
  }

  render(): ReactNode {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}
