import { ReactNode } from "react";

interface TableProps {
  children: ReactNode;
  className?: string;
}

interface TableHeaderProps {
  children: ReactNode;
  className?: string;
}

interface TableBodyProps {
  children: ReactNode;
  className?: string;
}

interface TableRowProps {
  children: ReactNode;
  className?: string;
}

interface TableCellProps {
  children: ReactNode;
  isHeader?: boolean;
  className?: string;
  colSpan?: number;
}

const Table: React.FC<TableProps> = ({ children, className }) => {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700/80 bg-white dark:bg-gray-900/50 shadow-sm">
      <table className={`min-w-full divide-y divide-gray-200 dark:divide-gray-700/80 ${className ?? ""}`}>
        {children}
      </table>
    </div>
  );
};

const TableHeader: React.FC<TableHeaderProps> = ({ children, className }) => {
  return (
    <thead className={`bg-gray-50 dark:bg-gray-800/60 ${className ?? ""}`}>
      {children}
    </thead>
  );
};

const TableBody: React.FC<TableBodyProps> = ({ children, className }) => {
  return (
    <tbody
      className={`divide-y divide-gray-100 dark:divide-gray-800 [&>tr]:transition-colors [&>tr:hover]:bg-gray-50 dark:[&>tr:hover]:bg-gray-800/40 ${className ?? ""}`}
    >
      {children}
    </tbody>
  );
};

const TableRow: React.FC<TableRowProps> = ({ children, className }) => {
  return <tr className={className}>{children}</tr>;
};

const TableCell: React.FC<TableCellProps> = ({
  children,
  isHeader = false,
  className,
  colSpan,
}) => {
  const CellTag = isHeader ? "th" : "td";
  const baseClasses = "px-4 py-3.5 text-left";
  const headerClasses =
    "text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 whitespace-nowrap";
  const cellClasses = "text-sm text-gray-700 dark:text-gray-300";
  const combined = `${baseClasses} ${isHeader ? headerClasses : cellClasses} ${className ?? ""}`.trim();
  return (
    <CellTag className={combined} colSpan={colSpan}>
      {children}
    </CellTag>
  );
};

export { Table, TableHeader, TableBody, TableRow, TableCell };
