# multiOS Universal File Type Ingestion & MIME Mapping

Architecture and MIME mapping specification introduced in multiOS 0.3.1 for everyday productivity and markdown documents.

## Extended File Format Support

- **Markdown & Plain Text:** `.md`, `.markdown`, `.txt`, `.rtf`, `.csv` with auto-detected character encoding (UTF-8 / Windows-1254).
- **Office & Documents:** `.docx`, `.xlsx`, `.pptx`, `.pdf` with native preview badge indicators.
- **Contact & Calendar:** `.vcf` (vCard) and `.ics` (iCalendar) payloads routed directly to system-registered handlers.
- **Developer Formats:** `.json`, `.yaml`, `.xml` with syntax-preserving UTF-8 stream decoding.
