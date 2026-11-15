import {useToast} from '@sanity/ui/toast'

// Wraps the standard Publish button so editors are told when the website will update.
export function withPublishNote(original) {
  const wrapped = (props) => {
    const result = original(props)
    const toast = useToast()
    if (!result) return result
    return {
      ...result,
      onHandle: () => {
        result.onHandle?.()
        toast.push({
          status: 'success',
          title: 'Publishing',
          description: 'The website updates in about a minute.',
          duration: 8000,
        })
      },
    }
  }
  wrapped.action = original.action
  return wrapped
}
