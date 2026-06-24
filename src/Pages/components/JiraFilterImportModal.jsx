import React from "react";
import { Button, Modal, Table, Message } from "semantic-ui-react";
import { fetchFavouriteJiraFilters } from "../../services/jiraClient";

const JiraFilterImportModal = ({ open, onClose, onImport, slotLabel }) => {
  const [filters, setFilters] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;

    const loadFilters = async () => {
      setLoading(true);
      setError("");
      try {
        const items = await fetchFavouriteJiraFilters();
        if (!cancelled) {
          setFilters(items);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load Jira filters");
          setFilters([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadFilters();

    return () => {
      cancelled = true;
    };
  }, [open]);

  const handlePick = (filter) => {
    onImport({
      label: filter.name || slotLabel,
      jql: filter.jql || "",
    });
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} size="large">
      <Modal.Header>Import Jira favourite filter</Modal.Header>
      <Modal.Content scrolling>
        <p className="ww-copy">
          Choose a favourite saved filter to fill {slotLabel}. The filter JQL is copied into the slot.
        </p>
        {error ? (
          <Message negative size="small">
            {error}
          </Message>
        ) : null}
        <Table celled compact selectable>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Name</Table.HeaderCell>
              <Table.HeaderCell>Owner</Table.HeaderCell>
              <Table.HeaderCell>JQL</Table.HeaderCell>
              <Table.HeaderCell />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {loading ? (
              <Table.Row>
                <Table.Cell colSpan="4">Loading favourite filters...</Table.Cell>
              </Table.Row>
            ) : filters.length === 0 ? (
              <Table.Row>
                <Table.Cell colSpan="4">No favourite filters found in Jira.</Table.Cell>
              </Table.Row>
            ) : (
              filters.map((filter) => (
                <Table.Row key={filter.id}>
                  <Table.Cell>{filter.name || filter.id}</Table.Cell>
                  <Table.Cell>{filter.owner || "-"}</Table.Cell>
                  <Table.Cell className="ww-filter-jql-cell">{filter.jql || "-"}</Table.Cell>
                  <Table.Cell collapsing>
                    <Button
                      size="mini"
                      primary
                      disabled={!filter.jql}
                      onClick={() => handlePick(filter)}
                    >
                      Use
                    </Button>
                  </Table.Cell>
                </Table.Row>
              ))
            )}
          </Table.Body>
        </Table>
      </Modal.Content>
      <Modal.Actions>
        <Button onClick={onClose}>Cancel</Button>
      </Modal.Actions>
    </Modal>
  );
};

export default JiraFilterImportModal;
