import { ChangeEvent, useState, useEffect, useMemo, useRef } from 'react';
import { FieldExtensionComponentProps } from '@backstage/plugin-scaffolder-react';
import {
  Button,
  TextField,
  Typography,
  Box,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Chip,
} from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import AddIcon from '@material-ui/icons/Add';
import CloseIcon from '@material-ui/icons/Close';
import { parseMarkdownLinks } from '../utils/parseMarkdownLinks';

const useStyles = makeStyles(theme => ({
  title: {
    fontSize: '1.2rem',
    fontWeight: 500,
    marginBottom: theme.spacing(1),
    color: theme.palette.text.primary,
  },
  description: {
    fontSize: '0.875rem',
    color: theme.palette.text.secondary,
    marginBottom: theme.spacing(2),
    lineHeight: 1.5,
  },
  addButton: {
    width: '100%',
    marginBottom: theme.spacing(2),
    padding: theme.spacing(1.5),
    textTransform: 'none',
    fontSize: '1rem',
  },
  itemsList: {
    marginTop: theme.spacing(1),
    display: 'flex',
    flexWrap: 'wrap',
    gap: theme.spacing(1),
  },
  itemChip: {
    marginBottom: theme.spacing(0.5),
  },
  dialogContent: {
    padding: theme.spacing(2),
  },
  inputField: {
    marginBottom: theme.spacing(2),
  },
}));

type PackageDefaultEntry =
  | string
  | { name: string; version?: string; source?: string };

function normalizeDefaultPackages(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((entry: PackageDefaultEntry) => {
      if (typeof entry === 'string') {
        return entry.trim();
      }
      if (
        entry &&
        typeof entry === 'object' &&
        typeof entry.name === 'string'
      ) {
        let line = entry.name.trim();
        const v = entry.version?.trim();
        if (v) {
          line += /^[=<>~!]/.test(v) ? v : `==${v}`;
        }
        const src = entry.source?.trim();
        if (src) {
          line += ` # ${src}`;
        }
        return line;
      }
      return '';
    })
    .filter(line => line.length > 0);
}

export const PackagesPickerExtension = ({
  onChange,
  disabled,
  rawErrors = [],
  schema,
  uiSchema,
  formData,
}: FieldExtensionComponentProps<string[]>) => {
  const classes = useStyles();

  const defaultItems = useMemo(
    () => normalizeDefaultPackages(schema?.default),
    [schema?.default],
  );

  const [items, setItems] = useState<string[]>(() =>
    formData !== undefined ? formData : defaultItems,
  );
  const appliedInitialDefaultRef = useRef(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newItem, setNewItem] = useState<string>('');

  const customTitle =
    uiSchema?.['ui:options']?.title || schema?.title || 'Items';
  const customDescription =
    uiSchema?.['ui:options']?.description || schema?.description;

  const itemsSchema = schema?.items as any;
  const customPlaceholder =
    itemsSchema?.['ui:placeholder'] ||
    itemsSchema?.ui?.placeholder ||
    'e.g., requests>=2.28.0, boto3';
  const itemTitle = itemsSchema?.title || 'Package';
  const itemDescription =
    itemsSchema?.description ||
    'Enter package details. Multiple packages can be separated by commas';

  useEffect(() => {
    if (formData !== undefined) {
      setItems(formData);
    }
  }, [formData]);

  useEffect(() => {
    if (appliedInitialDefaultRef.current) {
      return;
    }
    if (formData !== undefined) {
      appliedInitialDefaultRef.current = true;
      return;
    }
    appliedInitialDefaultRef.current = true;
    if (defaultItems.length > 0) {
      onChange(defaultItems);
    }
  }, [formData, defaultItems, onChange]);

  const handleAddItem = () => {
    if (newItem.trim()) {
      const packages = newItem
        .split(',')
        .map(pkg => pkg.trim())
        .filter(pkg => pkg.length > 0);

      if (packages.length > 0) {
        const updatedItems = [...items, ...packages];
        setItems(updatedItems);
        onChange(updatedItems);
        setNewItem('');
        setIsDialogOpen(false);
      }
    }
  };

  const handleRemoveItem = (index: number) => {
    const updatedItems = items.filter((_, i) => i !== index);
    setItems(updatedItems);
    onChange(updatedItems);
  };

  const handleItemChange = (event: ChangeEvent<HTMLInputElement>) => {
    setNewItem(event.target.value);
  };

  const openDialog = () => {
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setNewItem('');
  };

  return (
    <Box>
      <Typography className={classes.title}>{customTitle}</Typography>

      {customDescription && (
        <Typography className={classes.description} component="div">
          {parseMarkdownLinks(customDescription)}
        </Typography>
      )}

      <Button
        variant="outlined"
        startIcon={<AddIcon />}
        onClick={openDialog}
        disabled={disabled}
        className={classes.addButton}
      >
        Add Packages Manually
      </Button>

      {items.length > 0 && (
        <Box className={classes.itemsList}>
          {items.map((item, index) => (
            <Chip
              key={`${item}-${index}`}
              label={item}
              onDelete={() => handleRemoveItem(index)}
              deleteIcon={<CloseIcon />}
              disabled={disabled}
              color="primary"
              variant="outlined"
              className={classes.itemChip}
            />
          ))}
        </Box>
      )}

      <Dialog open={isDialogOpen} onClose={closeDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          Add New Package
          <IconButton
            aria-label="close"
            onClick={closeDialog}
            style={{ position: 'absolute', right: 8, top: 8 }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent className={classes.dialogContent}>
          <TextField
            fullWidth
            label={itemTitle}
            placeholder={customPlaceholder}
            value={newItem}
            onChange={handleItemChange}
            className={classes.inputField}
            helperText={`${itemDescription} (${customPlaceholder})`}
            required
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog}>Cancel</Button>
          <Button
            onClick={handleAddItem}
            variant="contained"
            color="primary"
            disabled={!newItem.trim()}
          >
            Add Package
          </Button>
        </DialogActions>
      </Dialog>

      {rawErrors.length > 0 && (
        <Typography
          color="error"
          variant="caption"
          style={{ marginTop: '8px', display: 'block' }}
        >
          {rawErrors.join(', ')}
        </Typography>
      )}
    </Box>
  );
};
