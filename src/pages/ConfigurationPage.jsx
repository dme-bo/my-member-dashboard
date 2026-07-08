// src/pages/ConfigurationPage.jsx
import { useEffect, useState } from "react";
import { FaTags, FaPlus, FaTrashAlt } from "react-icons/fa";
import { collection, deleteDoc, doc, getDocs, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";

const SECTIONS = [{ id: "tags", label: "Add Tags", icon: FaTags }];

const tagsCollectionRef = () => collection(db, "tags");
const tagDocRef = (tagId) => doc(db, "tags", tagId);

const normalizeTagLabel = (tagDoc) => {
  if (!tagDoc) return "";
  return String(
    tagDoc.name || tagDoc.tag || tagDoc.label || tagDoc.title || tagDoc.skill || tagDoc.value || tagDoc.id || ""
  ).trim();
};

function TagsSection() {
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newTag, setNewTag] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState("");

  const loadTags = async () => {
    setLoading(true);
    try {
      const snapshot = await getDocs(tagsCollectionRef());
      const rows = snapshot.docs
        .map((tagDoc) => ({ id: tagDoc.id, name: normalizeTagLabel({ id: tagDoc.id, ...tagDoc.data() }) }))
        .filter((tag) => tag.name)
        .sort((a, b) => a.name.localeCompare(b.name));
      setTags(rows);
    } catch (err) {
      console.error("Error loading tags:", err);
      setError("Failed to load tags.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTags();
  }, []);

  const handleAddTag = async () => {
    const trimmed = newTag.trim();
    if (!trimmed) return;

    const alreadyExists = tags.some((tag) => tag.name.toLowerCase() === trimmed.toLowerCase());
    if (alreadyExists) {
      setError(`"${trimmed}" already exists.`);
      return;
    }

    setError("");
    setSaving(true);
    try {
      await setDoc(tagDocRef(trimmed), {
        name: trimmed,
        createdAt: serverTimestamp(),
      });
      setTags((prev) => [...prev, { id: trimmed, name: trimmed }].sort((a, b) => a.name.localeCompare(b.name)));
      setNewTag("");
    } catch (err) {
      console.error("Error saving tag:", err);
      setError("Failed to save tag. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTag = async (tag) => {
    setDeletingId(tag.id);
    try {
      await deleteDoc(tagDocRef(tag.id));
      setTags((prev) => prev.filter((item) => item.id !== tag.id));
    } catch (err) {
      console.error("Error deleting tag:", err);
      setError("Failed to delete tag. Please try again.");
    } finally {
      setDeletingId("");
    }
  };

  return (
    <div>
      <h2 style={{ margin: "0 0 6px", fontSize: "20px", color: "#0f172a" }}>Manage Tags</h2>
      <p style={{ margin: "0 0 24px", fontSize: "13px", color: "#64748b" }}>
        Add tags here to make them available for tagging members across the app.
      </p>

      <div
        style={{
          display: "flex",
          gap: "10px",
          marginBottom: "10px",
          flexWrap: "wrap",
        }}
      >
        <input
          type="text"
          value={newTag}
          onChange={(e) => setNewTag(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAddTag();
            }
          }}
          placeholder="Type a new tag name..."
          style={{
            flex: "1 1 240px",
            padding: "11px 14px",
            borderRadius: "10px",
            border: "1px solid #cbd5e1",
            fontSize: "14px",
            outline: "none",
            color: "#0f172a",
          }}
        />
        <button
          type="button"
          onClick={handleAddTag}
          disabled={saving || !newTag.trim()}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            padding: "11px 20px",
            borderRadius: "10px",
            border: "none",
            background: saving || !newTag.trim() ? "#90caf9" : "#1976d2",
            color: "#fff",
            fontWeight: "700",
            fontSize: "14px",
            cursor: saving || !newTag.trim() ? "not-allowed" : "pointer",
          }}
        >
          <FaPlus size={12} />
          {saving ? "Saving..." : "Save Tag"}
        </button>
      </div>

      {error ? (
        <div style={{ marginBottom: "16px", color: "#dc2626", fontSize: "13px", fontWeight: "600" }}>{error}</div>
      ) : null}

      <div
        style={{
          border: "1px solid #e2e8f0",
          borderRadius: "14px",
          padding: "18px",
          background: "#f8fafc",
        }}
      >
        <div style={{ fontSize: "13px", fontWeight: "700", color: "#334155", marginBottom: "14px" }}>
          Existing Tags {tags.length > 0 ? `(${tags.length})` : ""}
        </div>

        {loading ? (
          <div style={{ fontSize: "13px", color: "#94a3b8" }}>Loading tags...</div>
        ) : tags.length === 0 ? (
          <div style={{ fontSize: "13px", color: "#94a3b8" }}>No tags added yet.</div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
            {tags.map((tag) => (
              <span
                key={tag.id}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "7px 8px 7px 14px",
                  borderRadius: "999px",
                  background: "#fff",
                  border: "1px solid #dbe3ee",
                  color: "#0f172a",
                  fontSize: "13px",
                  fontWeight: "600",
                }}
              >
                {tag.name}
                <button
                  type="button"
                  onClick={() => handleDeleteTag(tag)}
                  disabled={deletingId === tag.id}
                  title="Remove tag"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "20px",
                    height: "20px",
                    borderRadius: "999px",
                    border: "none",
                    background: "#f1f5f9",
                    color: "#64748b",
                    cursor: deletingId === tag.id ? "not-allowed" : "pointer",
                  }}
                >
                  <FaTrashAlt size={9} />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ConfigurationPage() {
  const [activeSection, setActiveSection] = useState("tags");

  return (
    <div
      style={{
        display: "flex",
        gap: "20px",
        padding: "20px",
        width: "100%",
        minHeight: "calc(100vh - 64px)",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          width: "240px",
          flex: "0 0 auto",
          background: "#fff",
          borderRadius: "16px",
          border: "1px solid #e2e8f0",
          boxShadow: "0 12px 28px rgba(15, 23, 42, 0.06)",
          padding: "14px",
          height: "fit-content",
        }}
      >
        <div style={{ fontSize: "12px", fontWeight: "800", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", padding: "6px 10px 12px" }}>
          Configuration
        </div>
        {SECTIONS.map((section) => {
          const Icon = section.icon;
          const isActive = activeSection === section.id;
          return (
            <button
              key={section.id}
              type="button"
              onClick={() => setActiveSection(section.id)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "11px 12px",
                borderRadius: "10px",
                border: "none",
                background: isActive ? "#eff6ff" : "transparent",
                color: isActive ? "#1976d2" : "#334155",
                fontWeight: isActive ? "700" : "600",
                fontSize: "14px",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <Icon size={14} />
              {section.label}
            </button>
          );
        })}
      </div>

      <div
        style={{
          flex: 1,
          minWidth: 0,
          background: "#fff",
          borderRadius: "16px",
          border: "1px solid #e2e8f0",
          boxShadow: "0 12px 28px rgba(15, 23, 42, 0.06)",
          padding: "24px",
        }}
      >
        {activeSection === "tags" && <TagsSection />}
      </div>
    </div>
  );
}
