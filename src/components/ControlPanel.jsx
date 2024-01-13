import { useContext, useState } from "react";
import {
  IconCaretdown,
  IconChevronRight,
  IconShareStroked,
  IconChevronUp,
  IconChevronDown,
  IconCheckboxTick,
  IconSaveStroked,
  IconUndo,
  IconRedo,
  IconRowsStroked,
  IconEdit,
  IconPlus,
} from "@douyinfe/semi-icons";
import { Link } from "react-router-dom";
import icon from "../assets/icon_dark_64.png";
import {
  Avatar,
  AvatarGroup,
  Button,
  Divider,
  Dropdown,
  InputNumber,
  Tooltip,
  Image,
  Modal,
  Spin,
  Input,
  Upload,
  Banner,
  Toast,
  TagInput,
} from "@douyinfe/semi-ui";
import { toPng, toJpeg, toSvg } from "html-to-image";
import { saveAs } from "file-saver";
import {
  jsonDiagramIsValid,
  enterFullscreen,
  exitFullscreen,
  ddbDiagramIsValid,
  dataURItoBlob,
  jsonToMySQL,
  jsonToPostgreSQL,
} from "../utils";
import {
  AreaContext,
  LayoutContext,
  NoteContext,
  SelectContext,
  SettingsContext,
  TabContext,
  TableContext,
  TypeContext,
  UndoRedoContext,
} from "../pages/Editor";
import { IconAddTable, IconAddArea, IconAddNote } from "./CustomIcons";
import { ObjectType, Action, Tab, State } from "../data/data";
import jsPDF from "jspdf";
import { useHotkeys } from "react-hotkeys-hook";
import { Validator } from "jsonschema";
import { areaSchema, noteSchema, tableSchema } from "../data/schemas";
import { Editor } from "@monaco-editor/react";
import { db } from "../data/db";
import { useLiveQuery } from "dexie-react-hooks";
import { socket } from "../data/socket";
// import { useCookies } from "react-cookie";
import axios from "axios";

export default function ControlPanel({
  diagramId,
  setDiagramId,
  title,
  setTitle,
  state,
  setState,
  lastSaved,
}) {
  const MODAL = {
    NONE: 0,
    IMG: 1,
    CODE: 2,
    IMPORT: 3,
    RENAME: 4,
    OPEN: 5,
    SAVEAS: 6,
    NEW: 7,
    SHARE: 8,
  };
  const STATUS = {
    NONE: 0,
    WARNING: 1,
    ERROR: 2,
    OK: 3,
  };
  const diagrams = useLiveQuery(() => db.diagrams.toArray());
  const [visible, setVisible] = useState(MODAL.NONE);
  const [prevTitle, setPrevTitle] = useState(title);
  const [saveAsTitle, setSaveAsTitle] = useState(title);
  const [selectedDiagramId, setSelectedDiagramId] = useState(0);
  const [selectedTemplateId, setSelectedTemplateId] = useState(-1);
  const [showEditName, setShowEditName] = useState(false);
  const [exportData, setExportData] = useState({
    data: null,
    filename: `diagram_${new Date().toISOString()}`,
    extension: "",
  });
  const [error, setError] = useState({
    type: STATUS.NONE,
    message: "",
  });
  const [data, setData] = useState(null);
  // const [cookies] = useCookies(["logged_in"]);
  const [addPeople, setAddPeople] = useState([])
  const { layout, setLayout } = useContext(LayoutContext);
  const { settings, setSettings } = useContext(SettingsContext);
  const {
    relationships,
    tables,
    setTables,
    addTable,
    updateTable,
    deleteTable,
    updateField,
    setRelationships,
    addRelationship,
    deleteRelationship,
  } = useContext(TableContext);
  const { types, addType, deleteType, updateType, setTypes } =
    useContext(TypeContext);
  const { notes, setNotes, updateNote, addNote, deleteNote } =
    useContext(NoteContext);
  const { areas, setAreas, updateArea, addArea, deleteArea } =
    useContext(AreaContext);
  const { undoStack, redoStack, setUndoStack, setRedoStack, setHistoryCount } =
    useContext(UndoRedoContext);
  const { selectedElement, setSelectedElement } = useContext(SelectContext);
  const { tab, setTab } = useContext(TabContext);

  const invertLayout = (component) =>
    setLayout((prev) => ({ ...prev, [component]: !prev[component] }));

  const diagramIsEmpty = () => {
    return (
      tables.length === 0 &&
      relationships.length === 0 &&
      notes.length === 0 &&
      areas.length === 0
    );
  };

  const overwriteDiagram = () => {
    setTables(data.tables);
    setRelationships(data.relationships);
    setAreas(data.subjectAreas);
    setNotes(data.notes);
  };

  const undo = () => {
    if (undoStack.length === 0) return;
    setHistoryCount(undoStack.length)
    const a = undoStack[undoStack.length - 1];
    if (socket && a)
      socket.emit("send-reversed-changes", a);
    setUndoStack(prev => prev.filter((e, i) => i !== prev.length - 1));
    if (a.action === Action.ADD) {
      if (a.element === ObjectType.TABLE) {
        deleteTable(tables[tables.length - 1].id, false);
      } else if (a.element === ObjectType.AREA) {
        deleteArea(areas[areas.length - 1].id, false);
      } else if (a.element === ObjectType.NOTE) {
        deleteNote(notes[notes.length - 1].id, false);
      } else if (a.element === ObjectType.RELATIONSHIP) {
        deleteRelationship(a.data.id, false);
      } else if (a.element === ObjectType.TYPE) {
        deleteType(types.length - 1, false);
      }
      setRedoStack((prev) => [...prev, a]);
    } else if (a.action === Action.MOVE) {
      if (a.element === ObjectType.TABLE) {
        setRedoStack((prev) => [
          ...prev,
          { ...a, x: tables[a.id].x, y: tables[a.id].y },
        ]);
        updateTable(a.id, { x: a.x, y: a.y }, true);
      } else if (a.element === ObjectType.AREA) {
        setRedoStack((prev) => [
          ...prev,
          { ...a, x: areas[a.id].x, y: areas[a.id].y },
        ]);
        updateArea(a.id, { x: a.x, y: a.y });
      } else if (a.element === ObjectType.NOTE) {
        setRedoStack((prev) => [
          ...prev,
          { ...a, x: notes[a.id].x, y: notes[a.id].y },
        ]);
        updateNote(a.id, { x: a.x, y: a.y });
      }
    } else if (a.action === Action.DELETE) {
      if (a.element === ObjectType.TABLE) {
        addTable(false, a.data);
      } else if (a.element === ObjectType.RELATIONSHIP) {
        addRelationship(false, a.data);
      } else if (a.element === ObjectType.NOTE) {
        addNote(false, a.data);
      } else if (a.element === ObjectType.AREA) {
        addArea(false, a.data);
      } else if (a.element === ObjectType.TYPE) {
        addType(false, { id: a.id, ...a.data });
      }
      setRedoStack((prev) => [...prev, a]);
    } else if (a.action === Action.EDIT) {
      if (a.element === ObjectType.AREA) {
        updateArea(a.aid, a.undo);
      } else if (a.element === ObjectType.NOTE) {
        updateNote(a.nid, a.undo);
      } else if (a.element === ObjectType.TABLE) {
        if (a.component === "field") {
          updateField(a.tid, a.fid, a.undo);
        } else if (a.component === "field_delete") {
          setRelationships((prev) => {
            return prev.map((e) => {
              if (e.startTableId === a.tid && e.startFieldId > a.data.id) {
                return {
                  ...e,
                  startFieldId: e.startFieldId + 1,
                  startX: tables[a.tid].x + 15,
                  startY: tables[a.tid].y + (e.startFieldId + 1) * 36 + 50 + 19,
                };
              }
              if (e.endTableId === a.tid && e.endFieldId > a.data.id) {
                return {
                  ...e,
                  endFieldId: e.endFieldId + 1,
                  endX: tables[a.tid].x + 15,
                  endY: tables[a.tid].y + (e.endFieldId + 1) * 36 + 50 + 19,
                };
              }
              return e;
            });
          });
          setTables((prev) =>
            prev.map((t) => {
              if (t.id === a.tid) {
                const temp = t.fields.slice();
                temp.splice(a.data.id, 0, a.data);
                return { ...t, fields: temp.map((t, i) => ({ ...t, id: i })) };
              }
              return t;
            })
          );
        } else if (a.component === "field_add") {
          updateTable(a.tid, {
            fields: tables[a.tid].fields
              .filter((e) => e.id !== tables[a.tid].fields.length - 1)
              .map((t, i) => ({ ...t, id: i })),
          });
        } else if (a.component === "index_add") {
          updateTable(a.tid, {
            indices: tables[a.tid].indices
              .filter((e) => e.id !== tables[a.tid].indices.length - 1)
              .map((t, i) => ({ ...t, id: i })),
          });
        } else if (a.component === "index") {
          updateTable(a.tid, {
            indices: tables[a.tid].indices.map((index) =>
              index.id === a.iid
                ? {
                  ...index,
                  ...a.undo,
                }
                : index
            ),
          });
        } else if (a.component === "index_delete") {
          setTables((prev) =>
            prev.map((table) => {
              if (table.id === a.tid) {
                const temp = table.indices.slice();
                temp.splice(a.data.id, 0, a.data);
                return {
                  ...table,
                  indices: temp.map((t, i) => ({ ...t, id: i })),
                };
              }
              return table;
            })
          );
        } else if (a.component === "self") {
          updateTable(a.tid, a.undo);
        }
      } else if (a.element === ObjectType.RELATIONSHIP) {
        setRelationships((prev) =>
          prev.map((e, idx) => (idx === a.rid ? { ...e, ...a.undo } : e))
        );
      } else if (a.element === ObjectType.TYPE) {
        if (a.component === "field_add") {
          updateType(a.tid, {
            fields: types[a.tid].fields.filter(
              (e, i) => i !== types[a.tid].fields.length - 1
            ),
          });
        }
        if (a.component === "field") {
          updateType(a.tid, {
            fields: types[a.tid].fields.map((e, i) =>
              i === a.fid ? { ...e, ...a.undo } : e
            ),
          });
        } else if (a.component === "field_delete") {
          setTypes((prev) =>
            prev.map((t, i) => {
              if (i === a.tid) {
                const temp = t.fields.slice();
                temp.splice(a.fid, 0, a.data);
                return { ...t, fields: temp };
              }
              return t;
            })
          );
        } else if (a.component === "self") {
          updateType(a.tid, a.undo);
        }
      }
      setRedoStack((prev) => [...prev, a]);
    } else if (a.action === Action.PAN) {
      setSettings((prev) => ({
        ...prev,
        pan: a.undo,
      }));
      setRedoStack((prev) => [...prev, a]);
    }
  };

  const redo = () => {
    if (redoStack.length === 0) return;
    const a = redoStack[redoStack.length - 1];
    setRedoStack(prev => prev.filter((e, i) => i !== prev.length - 1));
    if (a.action === Action.ADD) {
      if (a.element === ObjectType.TABLE) {
        addTable(false);
      } else if (a.element === ObjectType.AREA) {
        addArea(false);
      } else if (a.element === ObjectType.NOTE) {
        addNote(false);
      } else if (a.element === ObjectType.RELATIONSHIP) {
        addRelationship(false, a.data);
      } else if (a.element === ObjectType.TYPE) {
        addType(false);
      }
      setUndoStack((prev) => [...prev, a]);
    } else if (a.action === Action.MOVE) {
      if (a.element === ObjectType.TABLE) {
        setUndoStack((prev) => [
          ...prev,
          { ...a, x: tables[a.id].x, y: tables[a.id].y },
        ]);
        updateTable(a.id, { x: a.x, y: a.y }, true);
      } else if (a.element === ObjectType.AREA) {
        setUndoStack((prev) => [
          ...prev,
          { ...a, x: areas[a.id].x, y: areas[a.id].y },
        ]);
        updateArea(a.id, { x: a.x, y: a.y });
      } else if (a.element === ObjectType.NOTE) {
        setUndoStack((prev) => [
          ...prev,
          { ...a, x: notes[a.id].x, y: notes[a.id].y },
        ]);
        updateNote(a.id, { x: a.x, y: a.y });
      }
    } else if (a.action === Action.DELETE) {
      if (a.element === ObjectType.TABLE) {
        deleteTable(a.data.id, false);
      } else if (a.element === ObjectType.RELATIONSHIP) {
        deleteRelationship(a.data.id, false);
      } else if (a.element === ObjectType.NOTE) {
        deleteNote(a.data.id, false);
      } else if (a.element === ObjectType.AREA) {
        deleteArea(a.data.id, false);
      } else if (a.element === ObjectType.TYPE) {
        deleteType(a.id, false);
      }
      setUndoStack((prev) => [...prev, a]);
    } else if (a.action === Action.EDIT) {
      if (a.element === ObjectType.AREA) {
        updateArea(a.aid, a.redo);
      } else if (a.element === ObjectType.NOTE) {
        updateNote(a.nid, a.redo);
      } else if (a.element === ObjectType.TABLE) {
        if (a.component === "field") {
          updateField(a.tid, a.fid, a.redo);
        } else if (a.component === "field_delete") {
          setRelationships((prev) => {
            return prev.map((e) => {
              if (e.startTableId === a.tid && e.startFieldId > a.data.id) {
                return {
                  ...e,
                  startFieldId: e.startFieldId - 1,
                  startX: tables[a.tid].x + 15,
                  startY: tables[a.tid].y + (e.startFieldId - 1) * 36 + 50 + 19,
                };
              }
              if (e.endTableId === a.tid && e.endFieldId > a.data.id) {
                return {
                  ...e,
                  endFieldId: e.endFieldId - 1,
                  endX: tables[a.tid].x + 15,
                  endY: tables[a.tid].y + (e.endFieldId - 1) * 36 + 50 + 19,
                };
              }
              return e;
            });
          });
          updateTable(a.tid, {
            fields: tables[a.tid].fields
              .filter((field) => field.id !== a.data.id)
              .map((e, i) => ({ ...e, id: i })),
          });
        } else if (a.component === "field_add") {
          updateTable(a.tid, {
            fields: [
              ...tables[a.tid].fields,
              {
                name: "",
                type: "",
                default: "",
                check: "",
                primary: false,
                unique: false,
                notNull: false,
                increment: false,
                comment: "",
                id: tables[a.tid].fields.length,
              },
            ],
          });
        } else if (a.component === "index_add") {
          setTables((prev) =>
            prev.map((table) => {
              if (table.id === a.tid) {
                return {
                  ...table,
                  indices: [
                    ...table.indices,
                    {
                      id: table.indices.length,
                      name: `index_${table.indices.length}`,
                      fields: [],
                    },
                  ],
                };
              }
              return table;
            })
          );
        } else if (a.component === "index") {
          updateTable(a.tid, {
            indices: tables[a.tid].indices.map((index) =>
              index.id === a.iid
                ? {
                  ...index,
                  ...a.redo,
                }
                : index
            ),
          });
        } else if (a.component === "index_delete") {
          updateTable(a.tid, {
            indices: tables[a.tid].indices
              .filter((e) => e.id !== a.data.id)
              .map((t, i) => ({ ...t, id: i })),
          });
        } else if (a.component === "self") {
          updateTable(a.tid, a.redo, false);
        }
      } else if (a.element === ObjectType.RELATIONSHIP) {
        setRelationships((prev) =>
          prev.map((e, idx) => (idx === a.rid ? { ...e, ...a.redo } : e))
        );
      } else if (a.element === ObjectType.TYPE) {
        if (a.component === "field_add") {
          updateType(a.tid, {
            fields: [
              ...types[a.tid].fields,
              {
                name: "",
                type: "",
              },
            ],
          });
        } else if (a.component === "field") {
          updateType(a.tid, {
            fields: types[a.tid].fields.map((e, i) =>
              i === a.fid ? { ...e, ...a.redo } : e
            ),
          });
        } else if (a.component === "field_delete") {
          updateType(a.tid, {
            fields: types[a.tid].fields.filter((field, i) => i !== a.fid),
          });
        } else if (a.component === "self") {
          updateType(a.tid, a.redo);
        }
      }
      setUndoStack((prev) => [...prev, a]);
    } else if (a.action === Action.PAN) {
      setSettings((prev) => ({
        ...prev,
        pan: a.redo,
      }));
      setUndoStack((prev) => [...prev, a]);
    }
    setHistoryCount(undoStack.length)
  };

  const fileImport = () => setVisible(MODAL.IMPORT);
  const viewGrid = () =>
    setSettings((prev) => ({ ...prev, showGrid: !prev.showGrid }));
  const zoomIn = () =>
    setSettings((prev) => ({ ...prev, zoom: prev.zoom * 1.2 }));
  const zoomOut = () =>
    setSettings((prev) => ({ ...prev, zoom: prev.zoom / 1.2 }));
  const viewStrictMode = () => {
    setSettings((prev) => ({ ...prev, strictMode: !prev.strictMode }));
    Toast.success(`Stict mode is ${settings.strictMode ? "on" : "off"}.`);
  };
  const viewFieldSummary = () => {
    setSettings((prev) => ({
      ...prev,
      showFieldSummary: !prev.showFieldSummary,
    }));
    Toast.success(
      `Field summary is ${settings.showFieldSummary ? "off" : "on"}.`
    );
  };
  const copyAsImage = () => {
    toPng(document.getElementById("canvas")).then(function (dataUrl) {
      const blob = dataURItoBlob(dataUrl);
      navigator.clipboard
        .write([new ClipboardItem({ "image/png": blob })])
        .then(() => {
          Toast.success("Copied to clipboard.");
        })
        .catch(() => {
          Toast.error("Could not copy to clipboard.");
        });
    });
  };
  const resetView = () =>
    setSettings((prev) => ({ ...prev, zoom: 1, pan: { x: 0, y: 0 } }));
  const fitWindow = () => {
    const diagram = document.getElementById("diagram").getBoundingClientRect();
    const canvas = document.getElementById("canvas").getBoundingClientRect();

    const scaleX = canvas.width / diagram.width;
    const scaleY = canvas.height / diagram.height;

    const scale = Math.min(scaleX, scaleY);

    const translateX = canvas.width / 2;
    const translateY = canvas.height / 2;

    setSettings((prev) => ({
      ...prev,
      zoom: scale,
      pan: { x: translateX, y: translateY },
    }));
  };
  const edit = () => {
    if (selectedElement.element === ObjectType.TABLE) {
      if (!layout.sidebar) {
        setSelectedElement({
          element: ObjectType.TABLE,
          id: selectedElement.id,
          openDialogue: true,
          openCollapse: false,
        });
      } else {
        setTab(Tab.tables);
        setSelectedElement({
          element: ObjectType.TABLE,
          id: selectedElement.id,
          openDialogue: false,
          openCollapse: true,
        });
        if (tab !== Tab.tables) return;
        document
          .getElementById(`scroll_table_${selectedElement.id}`)
          .scrollIntoView({ behavior: "smooth" });
      }
    } else if (selectedElement.element === ObjectType.AREA) {
      if (layout.sidebar) {
        setTab(Tab.subject_areas);
        if (tab !== Tab.subject_areas) return;
        document
          .getElementById(`scroll_area_${selectedElement.id}`)
          .scrollIntoView({ behavior: "smooth" });
      } else {
        setSelectedElement({
          element: ObjectType.AREA,
          id: selectedElement.id,
          openDialogue: true,
          openCollapse: false,
        });
      }
    } else if (selectedElement.element === ObjectType.NOTE) {
      if (layout.sidebar) {
        setTab(Tab.notes);
        if (tab !== Tab.notes) return;
        document
          .getElementById(`scroll_note_${selectedElement.id}`)
          .scrollIntoView({ behavior: "smooth" });
      } else {
        setSelectedElement({
          element: ObjectType.NOTE,
          id: selectedElement.id,
          openDialogue: true,
          openCollapse: false,
        });
      }
    }
  };
  const del = () => {
    switch (selectedElement.element) {
      case ObjectType.TABLE:
        deleteTable(selectedElement.id, true);
        break;
      case ObjectType.NOTE:
        deleteNote(selectedElement.id, true);
        break;
      case ObjectType.AREA:
        deleteArea(selectedElement.id, true);
        break;
      default:
        break;
    }
  };
  const duplicate = () => {
    switch (selectedElement.element) {
      case ObjectType.TABLE:
        addTable(true, {
          ...tables[selectedElement.id],
          x: tables[selectedElement.id].x + 20,
          y: tables[selectedElement.id].y + 20,
          id: tables.length,
        });
        break;
      case ObjectType.NOTE:
        addNote(true, {
          ...notes[selectedElement.id],
          x: notes[selectedElement.id].x + 20,
          y: notes[selectedElement.id].y + 20,
          id: notes.length,
        });
        break;
      case ObjectType.AREA:
        addArea(true, {
          ...areas[selectedElement.id],
          x: areas[selectedElement.id].x + 20,
          y: areas[selectedElement.id].y + 20,
          id: areas.length,
        });
        break;
      default:
        break;
    }
  };
  const copy = () => {
    switch (selectedElement.element) {
      case ObjectType.TABLE:
        navigator.clipboard
          .writeText(JSON.stringify({ ...tables[selectedElement.id] }))
          .catch(() => {
            Toast.error("Could not copy");
          });
        break;
      case ObjectType.NOTE:
        navigator.clipboard
          .writeText(JSON.stringify({ ...notes[selectedElement.id] }))
          .catch(() => {
            Toast.error("Could not copy");
          });
        break;
      case ObjectType.AREA:
        navigator.clipboard
          .writeText(JSON.stringify({ ...areas[selectedElement.id] }))
          .catch(() => {
            Toast.error("Could not copy");
          });
        break;
      default:
        break;
    }
  };
  const paste = () => {
    navigator.clipboard.readText().then((text) => {
      let obj = null;
      try {
        obj = JSON.parse(text);
      } catch (error) {
        return;
      }
      const v = new Validator();
      if (v.validate(obj, tableSchema).valid) {
        addTable(true, {
          ...obj,
          x: obj.x + 20,
          y: obj.y + 20,
          id: tables.length,
        });
      } else if (v.validate(obj, areaSchema).valid) {
        addArea(true, {
          ...obj,
          x: obj.x + 20,
          y: obj.y + 20,
          id: areas.length,
        });
      } else if (v.validate(obj, noteSchema)) {
        addNote(true, {
          ...obj,
          x: obj.x + 20,
          y: obj.y + 20,
          id: notes.length,
        });
      }
    });
  };
  const cut = () => {
    copy();
    del();
  };
  const save = () => setState(State.SAVING);
  const open = () => setVisible(MODAL.OPEN);
  const saveDiagramAs = () => setVisible(MODAL.SAVEAS);
  const loadDiagram = async (id) => {
    await db.diagrams
      .get(id)
      .then((diagram) => {
        if (diagram) {
          setDiagramId(diagram.id);
          setTitle(diagram.name);
          setTables(diagram.tables);
          setTypes(diagram.types);
          setRelationships(diagram.references);
          setAreas(diagram.areas);
          setNotes(diagram.notes);
          setUndoStack([]);
          setRedoStack([]);
          window.name = `d ${diagram.id}`;
        } else {
          Toast.error("Oops! Something went wrong.");
        }
      })
      .catch(() => {
        Toast.error("Oops! Couldn't load diagram.");
      });
  };
  const createNewDiagram = (id) => {
    const newWindow = window.open("/editor");
    newWindow.name = "lt " + id;
  };

  const menu = {
    File: {
      New: {
        function: () => setVisible(MODAL.NEW),
      },
      "New window": {
        function: () => {
          const newWindow = window.open("/editor", "_blank");
          newWindow.name = window.name;
        },
      },
      Open: {
        function: open,
        shortcut: "Ctrl+O",
      },
      Save: {
        function: save,
        shortcut: "Ctrl+S",
      },
      "Save as": {
        function: saveDiagramAs,
        shortcut: "Ctrl+Shift+S",
      },
      "Save as template": {
        function: () => {
          db.templates
            .add({
              title: title,
              tables: tables,
              relationships: relationships,
              types: types,
              notes: notes,
              subjectAreas: areas,
              custom: 1,
            })
            .then(() => {
              Toast.success("Template saved!");
            });
        },
      },
      Share: {
        function: () => setVisible(MODAL.SHARE),
      },
      Rename: {
        function: () => {
          setVisible(MODAL.RENAME);
          setPrevTitle(title);
        },
      },
      "Delete diagram": {
        function: async () => {
          await db.diagrams
            .delete(diagramId)
            .then(() => {
              setDiagramId(0);
              setTitle("Untitled diagram");
              setTables([]);
              setRelationships([]);
              setAreas([]);
              setNotes([]);
              setTypes([]);
              setUndoStack([]);
              setRedoStack([]);
            })
            .catch(() => Toast.error("Oops! Something went wrong."));
        },
      },
      Import: {
        function: fileImport,
        shortcut: "Ctrl+I",
      },
      "Export as": {
        children: [
          {
            PNG: () => {
              toPng(document.getElementById("canvas")).then(function (dataUrl) {
                setExportData((prev) => ({
                  ...prev,
                  data: dataUrl,
                  extension: "png",
                }));
              });
              setVisible(MODAL.IMG);
            },
          },
          {
            JPEG: () => {
              toJpeg(document.getElementById("canvas"), { quality: 0.95 }).then(
                function (dataUrl) {
                  setExportData((prev) => ({
                    ...prev,
                    data: dataUrl,
                    extension: "jpeg",
                  }));
                }
              );
              setVisible(MODAL.IMG);
            },
          },
          {
            JSON: () => {
              setVisible(MODAL.CODE);
              const result = JSON.stringify(
                {
                  tables: tables,
                  relationships: relationships,
                  notes: notes,
                  subjectAreas: areas,
                  types: types,
                },
                null,
                2
              );
              setExportData((prev) => ({
                ...prev,
                data: result,
                extension: "json",
              }));
            },
          },
          {
            SVG: () => {
              const filter = (node) => node.tagName !== "i";
              toSvg(document.getElementById("canvas"), { filter: filter }).then(
                function (dataUrl) {
                  setExportData((prev) => ({
                    ...prev,
                    data: dataUrl,
                    extension: "svg",
                  }));
                }
              );
              setVisible(MODAL.IMG);
            },
          },
          {
            PDF: () => {
              const canvas = document.getElementById("canvas");
              toJpeg(canvas).then(function (dataUrl) {
                const doc = new jsPDF("l", "px", [
                  canvas.offsetWidth,
                  canvas.offsetHeight,
                ]);
                doc.addImage(
                  dataUrl,
                  "jpeg",
                  0,
                  0,
                  canvas.offsetWidth,
                  canvas.offsetHeight
                );
                doc.save(`${exportData.filename}.pdf`);
              });
            },
          },
          {
            DRAWDB: () => {
              const result = JSON.stringify(
                {
                  author: "Unnamed",
                  filename: title,
                  date: new Date().toISOString(),
                  tables: tables,
                  relationships: relationships,
                  notes: notes,
                  subjectAreas: areas,
                  types: types,
                },
                null,
                2
              );
              const blob = new Blob([result], {
                type: "text/plain;charset=utf-8",
              });
              saveAs(blob, `${exportData.filename}.ddb`);
            },
          },
        ],
        function: () => { },
      },
      "Export source": {
        children: [
          {
            MySQL: () => {
              setVisible(MODAL.CODE);
              const src = jsonToMySQL({
                tables: tables,
                references: relationships,
                types: types,
              });
              setExportData((prev) => ({
                ...prev,
                data: src,
                extension: "sql",
              }));
            },
          },
          {
            PostgreSQL: () => {
              setVisible(MODAL.CODE);
              const src = jsonToPostgreSQL({
                tables: tables,
                references: relationships,
                types: types,
              });
              setExportData((prev) => ({
                ...prev,
                data: src,
                extension: "sql",
              }));
            },
          },
          { DBML: () => { } },
        ],
        function: () => { },
      },
      Settings: {
        children: [
          {
            Autosave: () =>
              setSettings((prev) => {
                Toast.success(
                  `Autosave is ${settings.autosave ? "off" : "on"}`
                );
                return { ...prev, autosave: !prev.autosave };
              }),
          },
          {
            Panning: () =>
              setSettings((prev) => {
                Toast.success(`Panning is ${settings.panning ? "off" : "on"}`);
                return { ...prev, panning: !prev.panning };
              }),
          },
          {
            "Flush storage": async () => {
              db.delete()
                .then(() => {
                  Toast.success("Storage flushed");
                  window.location.reload(false);
                })
                .catch(() => {
                  Toast.error("Oops! Something went wrong.");
                });
            },
          },
        ],
      },
      Exit: {
        function: () => { },
      },
    },
    Edit: {
      Undo: {
        function: undo,
        shortcut: "Ctrl+Z",
      },
      Redo: {
        function: redo,
        shortcut: "Ctrl+Y",
      },
      Clear: {
        function: () => {
          setTables([]);
          setRelationships([]);
          setAreas([]);
          setNotes([]);
          setUndoStack([]);
          setRedoStack([]);
        },
      },
      Edit: {
        function: edit,
        shortcut: "Ctrl+E",
      },
      Cut: {
        function: cut,
        shortcut: "Ctrl+X",
      },
      Copy: {
        function: copy,
        shortcut: "Ctrl+C",
      },
      Paste: {
        function: paste,
        shortcut: "Ctrl+V",
      },
      Duplicate: {
        function: duplicate,
        shortcut: "Ctrl+D",
      },
      Delete: {
        function: del,
        shortcut: "Del",
      },
      "Copy as image": {
        function: copyAsImage,
        shortcut: "Ctrl+Alt+C",
      },
    },
    View: {
      Header: {
        function: () =>
          setLayout((prev) => ({ ...prev, header: !prev.header })),
      },
      Sidebar: {
        function: () =>
          setLayout((prev) => ({ ...prev, sidebar: !prev.sidebar })),
      },
      Issues: {
        function: () =>
          setLayout((prev) => ({ ...prev, issues: !prev.issues })),
      },
      Services: {
        function: () =>
          setLayout((prev) => ({ ...prev, services: !prev.services })),
      },
      "Strict mode": {
        function: viewStrictMode,
        shortcut: "Ctrl+Shift+M",
      },
      "Field summary": {
        function: viewFieldSummary,
        shortcut: "Ctrl+Shift+F",
      },
      "Reset view": {
        function: resetView,
        shortcut: "Ctrl+R",
      },
      "Show grid": {
        function: viewGrid,
        shortcut: "Ctrl+Shift+G",
      },
      "Show cardinality": {
        function: () =>
          setSettings((prev) => ({
            ...prev,
            showCardinality: !prev.showCardinality,
          })),
      },
      Theme: {
        children: [
          {
            Light: () => {
              const body = document.body;
              if (body.hasAttribute("theme-mode")) {
                body.setAttribute("theme-mode", "light");
              }
              localStorage.setItem("theme", "light");
              setSettings((prev) => ({ ...prev, mode: "light" }));
            },
          },
          {
            Dark: () => {
              const body = document.body;
              if (body.hasAttribute("theme-mode")) {
                body.setAttribute("theme-mode", "dark");
              }
              localStorage.setItem("theme", "dark");
              setSettings((prev) => ({ ...prev, mode: "dark" }));
            },
          },
        ],
        function: () => { },
      },
      "Zoom in": {
        function: zoomIn,
        shortcut: "Ctrl+Up/Wheel",
      },
      "Zoom out": {
        function: zoomOut,
        shortcut: "Ctrl+Down/Wheel",
      },
      Fullscreen: {
        function: enterFullscreen,
      },
    },
    Logs: {
      "Open logs": {
        function: () => { },
      },
      "Commit changes": {
        function: () => { },
      },
      "Revert changes": {
        function: () => { },
      },
    },
    Help: {
      Shortcuts: {
        function: () => window.open("/shortcuts", "_blank"),
        shortcut: "Ctrl+H",
      },
      "Ask us on discord": {
        function: () => { },
      },
      "Tweet us": {
        function: () => { },
      },
      "Report a bug": {
        function: () => window.open("/bug_report", "_blank"),
      },
      "Give feedback": {
        function: () => window.open("/survey", "_blank"),
      },
    },
  };

  useHotkeys("ctrl+i, meta+i", fileImport, { preventDefault: true });
  useHotkeys("ctrl+z, meta+z", undo, { preventDefault: true });
  useHotkeys("ctrl+y, meta+y", redo, { preventDefault: true });
  useHotkeys("ctrl+s, meta+s", save, { preventDefault: true });
  useHotkeys("ctrl+o, meta+o", open, { preventDefault: true });
  useHotkeys("ctrl+e, meta+e", edit, { preventDefault: true });
  useHotkeys("ctrl+d, meta+d", duplicate, { preventDefault: true });
  useHotkeys("ctrl+c, meta+c", copy, { preventDefault: true });
  useHotkeys("ctrl+v, meta+v", paste, { preventDefault: true });
  useHotkeys("ctrl+x, meta+x", cut, { preventDefault: true });
  useHotkeys("delete", del, { preventDefault: true });
  useHotkeys("ctrl+shift+g, meta+shift+g", viewGrid, { preventDefault: true });
  useHotkeys("ctrl+up, meta+up", zoomIn, { preventDefault: true });
  useHotkeys("ctrl+down, meta+down", zoomOut, { preventDefault: true });
  useHotkeys("ctrl+shift+m, meta+shift+m", viewStrictMode, {
    preventDefault: true,
  });
  useHotkeys("ctrl+shift+f, meta+shift+f", viewFieldSummary, {
    preventDefault: true,
  });
  useHotkeys("ctrl+shift+s, meta+shift+s", saveDiagramAs, {
    preventDefault: true,
  });
  useHotkeys("ctrl+alt+c, meta+alt+c", copyAsImage, { preventDefault: true });
  useHotkeys("ctrl+r, meta+r", resetView, { preventDefault: true });
  useHotkeys("ctrl+h, meta+h", () => window.open("/shortcuts", "_blank"), {
    preventDefault: true,
  });
  useHotkeys("ctrl+alt+w, meta+alt+w", fitWindow, { preventDefault: true });

  const getModalTitle = () => {
    switch (visible) {
      case MODAL.IMPORT:
        return "Import diagram";
      case MODAL.CODE:
        return "Export source";
      case MODAL.IMG:
        return "Export image";
      case MODAL.RENAME:
        return "Rename diagram";
      case MODAL.OPEN:
        return "Open diagram";
      case MODAL.SAVEAS:
        return "Save as";
      case MODAL.NEW:
        return "New diagram";
      case MODAL.SHARE:
        return "Share \"" + title + '"'
      default:
        return "";
    }
  };

  const getOkText = () => {
    switch (visible) {
      case MODAL.IMPORT:
        return "Import";
      case MODAL.CODE:
      case MODAL.IMG:
        return "Export";
      case MODAL.RENAME:
        return "Rename";
      case MODAL.OPEN:
        return "Open";
      case MODAL.SAVEAS:
        return "Save as";
      case MODAL.NEW:
        return "Create";
      default:
        return "Confirm";
    }
  };

  const getModalOnOk = async () => {
    switch (visible) {
      case MODAL.IMG:
        saveAs(
          exportData.data,
          `${exportData.filename}.${exportData.extension}`
        );
        return;
      case MODAL.CODE: {
        const blob = new Blob([exportData.data], {
          type: "application/json",
        });
        saveAs(blob, `${exportData.filename}.${exportData.extension}`);
        return;
      }
      case MODAL.IMPORT:
        if (error.type !== STATUS.ERROR) {
          setSettings((prev) => ({ ...prev, pan: { x: 0, y: 0 } }));
          overwriteDiagram();
          setData(null);
          setVisible(MODAL.NONE);
          setUndoStack([]);
          setRedoStack([]);
        }
        return;
      case MODAL.OPEN:
        if (selectedDiagramId === 0) return;
        loadDiagram(selectedDiagramId);
        setVisible(MODAL.NONE);
        return;
      case MODAL.RENAME:
        setPrevTitle(title);
        setVisible(MODAL.NONE);
        return;
      case MODAL.SAVEAS:
        db.diagrams.add({
          name: saveAsTitle,
          lastModified: new Date(),
          tables: tables,
          references: relationships,
          types: types,
          notes: notes,
          areas: areas,
        });
        setVisible(MODAL.NONE);
        return;
      case MODAL.NEW:
        setVisible(MODAL.NONE);
        createNewDiagram(selectedTemplateId);
        return;
      case MODAL.SHARE:
        // if (cookies.logged_in) {
          await axios
            .post(
              `${import.meta.env.VITE_API_BACKEND_URL}/share`,
              {
                people: addPeople,
                diagram: JSON.stringify({
                  name: title,
                  tables: tables,
                  references: relationships,
                  types: types,
                  notes: notes,
                  areas: areas,
                })
              },
              // { withCredentials: true }
            )
            .then((res) => {
              console.log(res)
              // window.location = window.location + '/sup'
            })
            .catch((e) => console.log(e));
        // }
        setVisible(MODAL.NONE)
        return;
      default:
        setVisible(MODAL.NONE);
        return;
    }
  };

  const importModalBody = () => {
    return (
      <>
        <Upload
          action="#"
          beforeUpload={({ file, fileList }) => {
            const f = fileList[0].fileInstance;
            if (!f) {
              return;
            }
            const reader = new FileReader();
            reader.onload = async (e) => {
              let jsonObject = null;
              try {
                jsonObject = JSON.parse(e.target.result);
              } catch (error) {
                setError({
                  type: STATUS.ERROR,
                  message: "The file contains an error.",
                });
                return;
              }
              if (f.type === "application/json") {
                if (!jsonDiagramIsValid(jsonObject)) {
                  setError({
                    type: STATUS.ERROR,
                    message:
                      "The file is missing necessary properties for a diagram.",
                  });
                  return;
                }
              } else if (f.name.split(".").pop() === "ddb") {
                if (!ddbDiagramIsValid(jsonObject)) {
                  setError({
                    type: STATUS.ERROR,
                    message:
                      "The file is missing necessary properties for a diagram.",
                  });
                  return;
                }
              }
              setData(jsonObject);
              if (diagramIsEmpty()) {
                setError({
                  type: STATUS.OK,
                  message: "Everything looks good. You can now import.",
                });
              } else {
                setError({
                  type: STATUS.WARNING,
                  message:
                    "The current diagram is not empty. Importing a new diagram will overwrite the current changes.",
                });
              }
            };
            reader.readAsText(f);

            return {
              autoRemove: false,
              fileInstance: file.fileInstance,
              status: "success",
              shouldUpload: false,
            };
          }}
          draggable={true}
          dragMainText="Drag and drop the file here or click to upload."
          dragSubText="Support json and ddb"
          accept="application/json,.ddb"
          onRemove={() =>
            setError({
              type: STATUS.NONE,
              message: "",
            })
          }
          onFileChange={() =>
            setError({
              type: STATUS.NONE,
              message: "",
            })
          }
          limit={1}
        ></Upload>
        {error.type === STATUS.ERROR ? (
          <Banner
            type="danger"
            fullMode={false}
            description={<div className="text-red-800">{error.message}</div>}
          />
        ) : error.type === STATUS.OK ? (
          <Banner
            type="info"
            fullMode={false}
            description={<div>{error.message}</div>}
          />
        ) : (
          error.type === STATUS.WARNING && (
            <Banner
              type="warning"
              fullMode={false}
              description={<div>{error.message}</div>}
            />
          )
        )}
      </>
    );
  };

  const newModalBody = () => (
    <div className="h-[360px] grid grid-cols-3 gap-2 overflow-auto px-1">
      <div>
        <div
          className={`h-[180px] w-full bg-blue-400 bg-opacity-30 flex justify-center items-center rounded hover:bg-opacity-40 hover:border-2 hover:border-dashed ${settings.mode === "light"
            ? "hover:border-blue-500"
            : "hover:border-white"
            } ${selectedTemplateId === 0 && "border-2 border-blue-500"}`}
          onClick={() => setSelectedTemplateId(0)}
        >
          <IconPlus style={{ color: "#fff" }} size="extra-large" />
        </div>
        <div className="text-center mt-1">Blank</div>
      </div>
      {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
        <div key={i}>
          <div
            className={`h-[180px] w-full bg-blue-400 bg-opacity-30 flex justify-center items-center rounded hover:bg-opacity-40 hover:border-2 hover:border-dashed ${settings.mode === "light"
              ? "hover:border-blue-500"
              : "hover:border-white"
              } ${selectedTemplateId === i && "border-2 border-blue-500"}`}
            onClick={() => setSelectedTemplateId(i)}
          >
            +
          </div>
          <div className="text-center mt-1">Template {i}</div>
        </div>
      ))}
    </div>
  );

  const getModalBody = () => {
    switch (visible) {
      case MODAL.IMPORT:
        return importModalBody();
      case MODAL.NEW:
        return newModalBody();
      case MODAL.RENAME:
        return (
          <Input
            placeholder="Diagram name"
            value={title}
            onChange={(v) => setTitle(v)}
          />
        );
      case MODAL.OPEN:
        return (
          <div>
            {diagrams?.length === 0 ? (
              <Banner
                fullMode={false}
                type="info"
                bordered
                icon={null}
                closeIcon={null}
                description={<div>You have no saved diagrams.</div>}
              />
            ) : (
              <div className="max-h-[360px]">
                <table className="w-full text-left border-separate border-spacing-x-0">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Last Modified</th>
                      <th>Size</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diagrams?.map((d) => {
                      const size = JSON.stringify(d).length;
                      let sizeStr;
                      if (size >= 1024 && size < 1024 * 1024)
                        sizeStr = (size / 1024).toFixed(1) + "KB";
                      else if (size >= 1024 * 1024)
                        sizeStr = (size / (1024 * 1024)).toFixed(1) + "MB";
                      else sizeStr = size + "B";
                      return (
                        <tr
                          key={d.id}
                          className={`${selectedDiagramId === d.id
                            ? "bg-blue-300 bg-opacity-30"
                            : "hover-1"
                            }`}
                          onClick={() => {
                            setSelectedDiagramId(d.id);
                          }}
                          onDoubleClick={() => {
                            loadDiagram(d.id);
                            window.name = "d " + d.id;
                            setVisible(MODAL.NONE);
                          }}
                        >
                          <td className="py-1">
                            <i className="bi bi-file-earmark-text text-[16px] me-1 opacity-60"></i>
                            {d.name}
                          </td>
                          <td className="py-1">
                            {d.lastModified.toLocaleDateString() +
                              " " +
                              d.lastModified.toLocaleTimeString()}
                          </td>
                          <td className="py-1">{sizeStr}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      case MODAL.SAVEAS:
        return (
          <Input
            placeholder="Diagram name"
            value={saveAsTitle}
            onChange={(v) => setSaveAsTitle(v)}
          />
        );
      case MODAL.CODE:
      case MODAL.IMG:
        if (exportData.data !== "" || exportData.data) {
          return (
            <>
              {visible === MODAL.IMG ? (
                <Image src={exportData.data} alt="Diagram" height={280} />
              ) : (
                <Editor
                  height="360px"
                  value={exportData.data}
                  language={exportData.extension}
                  options={{ readOnly: true }}
                  theme={settings.mode === "light" ? "light" : "vs-dark"}
                />
              )}
              <div className="text-sm font-semibold mt-2">Filename:</div>
              <Input
                value={exportData.filename}
                placeholder="Filename"
                suffix={<div className="p-2">{`.${exportData.extension}`}</div>}
                onChange={(value) =>
                  setExportData((prev) => ({ ...prev, filename: value }))
                }
                field="filename"
              />
            </>
          );
        } else {
          return (
            <div className="text-center my-3">
              <Spin tip="Loading..." size="large" />
            </div>
          );
        }
      case MODAL.SHARE:
        // if (cookies.logged_in) {
          return <div>
            <TagInput
              placeholder='Add people'
              onChange={v => setAddPeople(v)}
              size="large"
            />
            <div className="my-3 text-base font-semibold">People with access</div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Avatar alt="hi" size="default">hi</Avatar>
                <div>
                  <div>Username (you)</div>
                  <div className="opacity-60">Email@gmail.com</div>
                </div>
              </div>
              <div className="opacity-60">Owner</div>
            </div>
          </div>
        // } else {
        //   return <div>
        //     You&apos;ll need to <Link to="/login" target="_blank" className="text-blue-600 font-bold hover:underline">log in</Link> before you can share this diagram.
        //   </div>
        // }
      default:
        return <></>;
    }
  };

  return (
    <>
      {layout.header && header()}
      {toolbar()}
      <Modal
        title={getModalTitle()}
        visible={visible !== MODAL.NONE}
        onOk={getModalOnOk}
        afterClose={() => {
          setExportData(() => ({
            data: "",
            extension: "",
            filename: `diagram_${new Date().toISOString()}`,
          }));
          setError({
            type: STATUS.NONE,
            message: "",
          });
          setData(null);
        }}
        onCancel={() => {
          if (visible === MODAL.RENAME) setTitle(prevTitle);
          setVisible(MODAL.NONE);
        }}
        centered
        closeOnEsc={true}
        okText={getOkText()}
        okButtonProps={{
          disabled:
            (visible === MODAL.IMPORT &&
              (error.type === STATUS.ERROR || !data)) ||
            ((visible === MODAL.IMG || visible === MODAL.CODE) &&
              !exportData.data) ||
            (visible === MODAL.RENAME && title === "") ||
            (visible === MODAL.SAVEAS && saveAsTitle === ""),
        }}
        cancelText="Cancel"
        width={600}
      >
        {getModalBody()}
      </Modal>
    </>
  );

  function toolbar() {
    return (
      <div className="py-1 px-5 flex justify-between items-center rounded-xl my-1 sm:mx-1 xl:mx-6 select-none overflow-x-hidden toolbar-theme">
        <div className="flex justify-start items-center">
          {layoutDropdown()}
          <Divider layout="vertical" margin="8px" />
          <Dropdown
            style={{ width: "240px" }}
            position="bottomLeft"
            render={
              <Dropdown.Menu>
                <Dropdown.Item
                  onClick={fitWindow}
                  style={{ display: "flex", justifyContent: "space-between" }}
                >
                  <div>Fit window / Reset</div>
                  <div className="text-gray-400">Ctrl+Alt+W</div>
                </Dropdown.Item>
                <Dropdown.Divider />
                {[0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0].map((e, i) => (
                  <Dropdown.Item
                    key={i}
                    onClick={() => {
                      setSettings((prev) => ({ ...prev, zoom: e }));
                    }}
                  >
                    {Math.floor(e * 100)}%
                  </Dropdown.Item>
                ))}
                <Dropdown.Divider />
                <Dropdown.Item>
                  <InputNumber
                    field="zoom"
                    label="Custom zoom"
                    placeholder="Zoom"
                    suffix={<div className="p-1">%</div>}
                    onChange={(v) =>
                      setSettings((prev) => ({
                        ...prev,
                        zoom: parseFloat(v) * 0.01,
                      }))
                    }
                  />
                </Dropdown.Item>
              </Dropdown.Menu>
            }
            trigger="click"
          >
            <div className="py-1 px-2 hover-2 rounded flex items-center justify-center">
              <div className="w-[40px]">{Math.floor(settings.zoom * 100)}%</div>
              <div>
                <IconCaretdown />
              </div>
            </div>
          </Dropdown>
          <Tooltip content="Zoom in" position="bottom">
            <button
              className="py-1 px-2 hover-2 rounded text-lg"
              onClick={() =>
                setSettings((prev) => ({ ...prev, zoom: prev.zoom * 1.2 }))
              }
            >
              <i className="fa-solid fa-magnifying-glass-plus"></i>
            </button>
          </Tooltip>
          <Tooltip content="Zoom out" position="bottom">
            <button
              className="py-1 px-2 hover-2 rounded text-lg"
              onClick={() =>
                setSettings((prev) => ({ ...prev, zoom: prev.zoom / 1.2 }))
              }
            >
              <i className="fa-solid fa-magnifying-glass-minus"></i>
            </button>
          </Tooltip>
          <Divider layout="vertical" margin="8px" />
          <Tooltip content="Undo" position="bottom">
            <button
              className="py-1 px-2 hover-2 rounded flex items-center"
              onClick={undo}
            >
              <IconUndo
                size="large"
                style={{ color: undoStack.length === 0 ? "#9598a6" : "" }}
              />
            </button>
          </Tooltip>
          <Tooltip content="Redo" position="bottom">
            <button
              className="py-1 px-2 hover-2 rounded flex items-center"
              onClick={redo}
            >
              <IconRedo
                size="large"
                style={{ color: redoStack.length === 0 ? "#9598a6" : "" }}
              />
            </button>
          </Tooltip>
          <Divider layout="vertical" margin="8px" />
          <Tooltip content="Add table" position="bottom">
            <button
              className="flex items-center py-1 px-2 hover-2 rounded"
              onClick={() => addTable()}
            >
              <IconAddTable theme={settings.mode} />
            </button>
          </Tooltip>
          <Tooltip content="Add subject area" position="bottom">
            <button
              className="py-1 px-2 hover-2 rounded flex items-center"
              onClick={() => addArea()}
            >
              <IconAddArea theme={settings.mode} />
            </button>
          </Tooltip>
          <Tooltip content="Add note" position="bottom">
            <button
              className="py-1 px-2 hover-2 rounded flex items-center"
              onClick={() => addNote()}
            >
              <IconAddNote theme={settings.mode} />
            </button>
          </Tooltip>
          <Divider layout="vertical" margin="8px" />
          <Tooltip content="Save" position="bottom">
            <button
              className="py-1 px-2 hover-2 rounded flex items-center"
              onClick={save}
            >
              <IconSaveStroked size="extra-large" />
            </button>
          </Tooltip>
          <Tooltip content="Commit" position="bottom">
            <button className="py-1 px-2 hover-2 rounded text-xl">
              <i className="fa-solid fa-code-branch"></i>
            </button>
          </Tooltip>
        </div>
        <button
          onClick={() => invertLayout("header")}
          className="flex items-center"
        >
          {layout.header ? <IconChevronUp /> : <IconChevronDown />}
        </button>
      </div>
    );
  }

  function getState() {
    switch (state) {
      case State.NONE:
        return "No changes";
      case State.LOADING:
        return "Loading . . .";
      case State.SAVED:
        return `Last saved ${lastSaved}`;
      case State.SAVING:
        return "Saving . . .";
      case State.ERROR:
        return "Failed to save";
      default:
        return "";
    }
  }

  function header() {
    return (
      <nav className="flex justify-between pt-1 items-center whitespace-nowrap">
        <div className="flex justify-start items-center">
          <Link to="/">
            <img
              width={54}
              src={icon}
              alt="logo"
              className="ms-8 min-w-[54px]"
            />
          </Link>
          <div className="ms-1 mt-1">
            <div className="flex items-center">
              <div
                className="text-xl ms-3 me-1"
                onMouseEnter={() => setShowEditName(true)}
                onMouseLeave={() => setShowEditName(false)}
                onClick={() => setVisible(MODAL.RENAME)}
              >
                {window.name.split(" ")[0] === "t" ? "Templates/" : "Diagrams/"}
                {title}
              </div>
              {(showEditName || visible === MODAL.RENAME) && <IconEdit />}
            </div>
            <div className="flex justify-between items-center">
              <div className="flex justify-start text-md select-none me-2">
                {Object.keys(menu).map((category) => (
                  <Dropdown
                    key={category}
                    position="bottomLeft"
                    style={{ width: "220px" }}
                    render={
                      <Dropdown.Menu>
                        {Object.keys(menu[category]).map((item, index) => {
                          if (menu[category][item].children) {
                            return (
                              <Dropdown
                                style={{ width: "120px" }}
                                key={item}
                                position={"rightTop"}
                                render={
                                  <Dropdown.Menu>
                                    {menu[category][item].children.map(
                                      (e, i) => (
                                        <Dropdown.Item
                                          key={i}
                                          onClick={Object.values(e)[0]}
                                        >
                                          {Object.keys(e)[0]}
                                        </Dropdown.Item>
                                      )
                                    )}
                                  </Dropdown.Menu>
                                }
                              >
                                <Dropdown.Item
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                  }}
                                  onClick={menu[category][item].function}
                                >
                                  {item}
                                  <IconChevronRight />
                                </Dropdown.Item>
                              </Dropdown>
                            );
                          }
                          return (
                            <Dropdown.Item
                              key={index}
                              onClick={menu[category][item].function}
                              style={
                                menu[category][item].shortcut && {
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                }
                              }
                            >
                              {menu[category][item].shortcut ? (
                                <>
                                  <div>{item}</div>
                                  <div className="text-gray-400">
                                    {menu[category][item].shortcut}
                                  </div>
                                </>
                              ) : (
                                item
                              )}
                            </Dropdown.Item>
                          );
                        })}
                      </Dropdown.Menu>
                    }
                  >
                    <div className="px-3 py-1 hover-2 rounded">{category}</div>
                  </Dropdown>
                ))}
              </div>
              <Button
                size="small"
                type="tertiary"
                icon={
                  state === State.LOADING || state === State.SAVING ? (
                    <Spin size="small" />
                  ) : null
                }
              >
                {getState()}
              </Button>
            </div>
          </div>
        </div>
        <div className="flex justify-around items-center text-md me-8">
          <AvatarGroup maxCount={3} size="default">
            <Avatar color="red" alt="Lisa LeBlanc">
              LL
            </Avatar>
            <Avatar color="green" alt="Caroline Xiao">
              CX
            </Avatar>
            <Avatar color="amber" alt="Rafal Matin">
              RM
            </Avatar>
            <Avatar alt="Zank Lance">ZL</Avatar>
            <Avatar alt="Youself Zhang">YZ</Avatar>
          </AvatarGroup>
          <Button
            type="primary"
            style={{
              fontSize: "16px",
              marginLeft: "12px",
              marginRight: "12px",
            }}
            size="large"
            icon={<IconShareStroked />}
            onClick={() => setVisible(MODAL.SHARE)}
          >
            Share
          </Button>
          <Avatar size="default" alt="Buni Zhang">
            BZ
          </Avatar>
        </div>
      </nav>
    );
  }

  function layoutDropdown() {
    return (
      <Dropdown
        position="bottomLeft"
        style={{ width: "180px" }}
        render={
          <Dropdown.Menu>
            <Dropdown.Item
              icon={
                layout.header ? (
                  <IconCheckboxTick />
                ) : (
                  <div className="px-2"></div>
                )
              }
              onClick={() => invertLayout("header")}
            >
              Header
            </Dropdown.Item>
            <Dropdown.Item
              icon={
                layout.sidebar ? (
                  <IconCheckboxTick />
                ) : (
                  <div className="px-2"></div>
                )
              }
              onClick={() => invertLayout("sidebar")}
            >
              Sidebar
            </Dropdown.Item>
            <Dropdown.Item
              icon={
                layout.issues ? (
                  <IconCheckboxTick />
                ) : (
                  <div className="px-2"></div>
                )
              }
              onClick={() => invertLayout("issues")}
            >
              Issues
            </Dropdown.Item>

            <Dropdown.Item
              icon={
                layout.services ? (
                  <IconCheckboxTick />
                ) : (
                  <div className="px-2"></div>
                )
              }
              onClick={() => invertLayout("services")}
            >
              Services
            </Dropdown.Item>
            <Dropdown.Divider />
            <Dropdown.Item
              icon={
                layout.fullscreen ? (
                  <IconCheckboxTick />
                ) : (
                  <div className="px-2"></div>
                )
              }
              onClick={() => {
                if (layout.fullscreen) {
                  exitFullscreen();
                } else {
                  enterFullscreen();
                }
                invertLayout("fullscreen");
              }}
            >
              Fullscreen
            </Dropdown.Item>
          </Dropdown.Menu>
        }
        trigger="click"
      >
        <div className="py-1 px-2 hover-2 rounded flex items-center justify-center">
          <IconRowsStroked size="extra-large" />
          <div>
            <IconCaretdown />
          </div>
        </div>
      </Dropdown>
    );
  }
}
