import { render, screen } from '@testing-library/react';
import {
  LoadingSpinner,
  LoadingOverlay,
  LoadingInline,
  ProgressBar,
  Skeleton,
  CardSkeleton,
  TableSkeleton,
} from '../Loading';

describe('Loading Components', () => {
  describe('LoadingSpinner', () => {
    it('renders with default props', () => {
      render(<LoadingSpinner />);
      
      const spinner = screen.getByRole('img', { name: /loading/i });
      expect(spinner).toBeInTheDocument();
      expect(spinner).toHaveClass('h-6', 'w-6', 'text-blue-600', 'animate-spin');
    });

    it('renders with custom size', () => {
      render(<LoadingSpinner size="lg" />);
      
      const spinner = screen.getByRole('img', { name: /loading/i });
      expect(spinner).toHaveClass('h-8', 'w-8');
    });

    it('renders with custom color', () => {
      render(<LoadingSpinner color="white" />);
      
      const spinner = screen.getByRole('img', { name: /loading/i });
      expect(spinner).toHaveClass('text-white');
    });

    it('applies custom className', () => {
      render(<LoadingSpinner className="custom-spinner" />);
      
      const spinner = screen.getByRole('img', { name: /loading/i });
      expect(spinner).toHaveClass('custom-spinner');
    });
  });

  describe('LoadingOverlay', () => {
    it('renders when visible', () => {
      render(<LoadingOverlay isVisible={true} />);
      
      const overlay = screen.getByRole('dialog', { name: /loading/i });
      expect(overlay).toBeInTheDocument();
      expect(overlay).toHaveAttribute('aria-modal', 'true');
      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    it('does not render when not visible', () => {
      render(<LoadingOverlay isVisible={false} />);
      
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('renders with custom message', () => {
      render(<LoadingOverlay isVisible={true} message="Processing data..." />);
      
      expect(screen.getByText('Processing data...')).toBeInTheDocument();
    });

    it('applies custom className', () => {
      render(<LoadingOverlay isVisible={true} className="custom-overlay" />);
      
      const overlay = screen.getByRole('dialog');
      expect(overlay).toHaveClass('custom-overlay');
    });
  });

  describe('LoadingInline', () => {
    it('renders with default props', () => {
      render(<LoadingInline />);
      
      const container = screen.getByRole('status');
      expect(container).toBeInTheDocument();
      expect(container).toHaveAttribute('aria-live', 'polite');
      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    it('renders with custom message', () => {
      render(<LoadingInline message="Fetching data..." />);
      
      expect(screen.getByText('Fetching data...')).toBeInTheDocument();
    });

    it('renders with custom size', () => {
      render(<LoadingInline size="lg" />);
      
      const spinner = screen.getByRole('img', { name: /loading/i });
      expect(spinner).toHaveClass('h-8', 'w-8');
    });

    it('applies custom className', () => {
      render(<LoadingInline className="custom-inline" />);
      
      const container = screen.getByRole('status');
      expect(container).toHaveClass('custom-inline');
    });
  });

  describe('ProgressBar', () => {
    it('renders with progress value', () => {
      render(<ProgressBar progress={50} />);
      
      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toBeInTheDocument();
      expect(progressBar).toHaveAttribute('aria-valuenow', '50');
      expect(progressBar).toHaveAttribute('aria-valuemin', '0');
      expect(progressBar).toHaveAttribute('aria-valuemax', '100');
    });

    it('shows percentage by default', () => {
      render(<ProgressBar progress={75} />);
      
      expect(screen.getByText('75%')).toBeInTheDocument();
    });

    it('hides percentage when showPercentage is false', () => {
      render(<ProgressBar progress={75} showPercentage={false} />);
      
      expect(screen.queryByText('75%')).not.toBeInTheDocument();
    });

    it('renders with label', () => {
      render(<ProgressBar progress={30} label="Upload Progress" />);
      
      expect(screen.getByText('Upload Progress')).toBeInTheDocument();
    });

    it('clamps progress values', () => {
      const { rerender } = render(<ProgressBar progress={150} />);
      
      let progressBar = screen.getByRole('progressbar');
      expect(progressBar).toHaveAttribute('aria-valuenow', '100');
      expect(screen.getByText('100%')).toBeInTheDocument();

      rerender(<ProgressBar progress={-10} />);
      
      progressBar = screen.getByRole('progressbar');
      expect(progressBar).toHaveAttribute('aria-valuenow', '0');
      expect(screen.getByText('0%')).toBeInTheDocument();
    });

    it('applies custom color', () => {
      render(<ProgressBar progress={50} color="green" />);
      
      const progressBar = screen.getByRole('progressbar');
      const progressFill = progressBar.querySelector('.bg-green-600');
      expect(progressFill).toBeInTheDocument();
    });

    it('applies custom className', () => {
      render(<ProgressBar progress={50} className="custom-progress" />);
      
      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toHaveClass('custom-progress');
    });
  });

  describe('Skeleton', () => {
    it('renders with default props', () => {
      render(<Skeleton />);
      
      const skeleton = screen.getByRole('status', { name: /loading content/i });
      expect(skeleton).toBeInTheDocument();
      expect(skeleton).toHaveClass('animate-pulse');
    });

    it('renders multiple lines', () => {
      render(<Skeleton lines={3} />);
      
      const skeleton = screen.getByRole('status');
      const lines = skeleton.querySelectorAll('div');
      expect(lines).toHaveLength(3);
    });

    it('applies custom height', () => {
      render(<Skeleton height="h-8" />);
      
      const skeleton = screen.getByRole('status');
      const line = skeleton.querySelector('div');
      expect(line).toHaveClass('h-8');
    });

    it('applies custom className', () => {
      render(<Skeleton className="custom-skeleton" />);
      
      const skeleton = screen.getByRole('status');
      expect(skeleton).toHaveClass('custom-skeleton');
    });
  });

  describe('CardSkeleton', () => {
    it('renders card skeleton', () => {
      render(<CardSkeleton />);
      
      const skeleton = screen.getByRole('status', { name: /loading card/i });
      expect(skeleton).toBeInTheDocument();
      expect(skeleton).toHaveClass('bg-white', 'p-6', 'rounded-lg', 'shadow');
    });

    it('applies custom className', () => {
      render(<CardSkeleton className="custom-card-skeleton" />);
      
      const skeleton = screen.getByRole('status');
      expect(skeleton).toHaveClass('custom-card-skeleton');
    });
  });

  describe('TableSkeleton', () => {
    it('renders table skeleton with default props', () => {
      render(<TableSkeleton />);
      
      const skeleton = screen.getByRole('status', { name: /loading table/i });
      expect(skeleton).toBeInTheDocument();
      expect(skeleton).toHaveClass('bg-white', 'rounded-lg', 'shadow');
    });

    it('renders custom number of rows and columns', () => {
      render(<TableSkeleton rows={3} columns={2} />);
      
      const skeleton = screen.getByRole('status');
      
      // Check header row
      const headerRow = skeleton.querySelector('.bg-gray-50');
      expect(headerRow).toBeInTheDocument();
      
      // Check data rows (3 rows + 1 header = 4 total)
      const allRows = skeleton.querySelectorAll('.px-6.py-4, .px-6.py-3');
      expect(allRows).toHaveLength(4); // 1 header + 3 data rows
    });

    it('applies custom className', () => {
      render(<TableSkeleton className="custom-table-skeleton" />);
      
      const skeleton = screen.getByRole('status');
      expect(skeleton).toHaveClass('custom-table-skeleton');
    });
  });
});