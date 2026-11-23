import React from 'react';

interface State {
  hasError: boolean;
  message: string;
}

export class MinigameErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message || 'Lỗi hiển thị minigame' };
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-4">
          <div className="text-4xl">🛠️</div>
          <h3 className="text-xl font-black">Đã xảy ra sự cố cục bộ ở trò chơi này</h3>
          <p className="text-sm opacity-75 max-w-md">{this.state.message}</p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, message: '' })}
            className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-sm"
          >
            Thử tải lại trò chơi
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
