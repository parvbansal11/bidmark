import { useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Input'
import { DOCUMENT_CATEGORIES } from '@/types'
import { UploadCloud } from 'lucide-react'
import { titleCase } from '@/lib/utils'

export function DocumentUploader({
  onUpload,
  uploading,
}: {
  onUpload: (category: string, file: File) => void | Promise<void>
  uploading?: boolean
}) {
  const [category, setCategory] = useState<string>('GST')
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-slate-300 p-3">
      <Select value={category} onChange={(e) => setCategory(e.target.value)} className="w-48">
        {DOCUMENT_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {titleCase(c)}
          </option>
        ))}
      </Select>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onUpload(category, file)
          e.target.value = ''
        }}
      />
      <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={uploading}>
        <UploadCloud className="h-4 w-4" /> {uploading ? 'Uploading…' : 'Upload document'}
      </Button>
    </div>
  )
}
