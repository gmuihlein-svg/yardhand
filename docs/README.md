# Documents

Owner/partner-facing documents for Yardhand (Ext Professionals).

| File | What it is |
|---|---|
| `Ext-Professionals-Operators-Guide.docx` | How-to-use-the-app guide for the owner & staff (12 sections). |
| `Yardhand-Partnership-Pitch.docx` | B2B pitch for selling the platform to other rental businesses (white-label). |
| `build-guide.js` | Script that generates the Operator's Guide `.docx`. |
| `build-pitch.js` | Script that generates the Partnership Pitch `.docx`. |

## Regenerating the .docx files

The build scripts use the `docx` npm package (not a project dependency).

```bash
cd docs
npm install docx        # one-time, if not present
node build-guide.js     # regenerates Ext-Professionals-Operators-Guide.docx
node build-pitch.js     # regenerates Yardhand-Partnership-Pitch.docx
```

Edit the `.js` scripts to change content, then re-run. See `../PROJECT-NOTES.md`
for overall project state and what still needs documenting (e.g. the
"Managing Customers" multi-tenant admin guide).
