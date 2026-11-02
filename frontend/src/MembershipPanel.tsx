import { useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '@clerk/react'

export type MemberRole = 'owner' | 'admin' | 'member'

export type GroupMember = {
  user: {
    id: number
    username: string
  }
  role: MemberRole
}

export type ChatGroup = {
  id: number
  name: string
  members: GroupMember[]
  current_user_role: MemberRole | null
}

type MembershipPanelProps = {
  group: ChatGroup
  conversationId: number
  onGroupUpdated: (group: ChatGroup) => void
}

const backendUrl =
  import.meta.env.VITE_BACKEND_URL ??
  (import.meta.env.PROD ? '' : 'http://localhost:8000')

function MembershipPanel({
  group,
  conversationId,
  onGroupUpdated,
}: MembershipPanelProps) {
  const { getToken } = useAuth()
  const [memberId, setMemberId] = useState('')
  const [error, setError] = useState('')
  const [isManagingMembers, setIsManagingMembers] = useState(false)
  const currentRole = group.current_user_role

  async function addMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const userId = Number(memberId.trim())
    if (!Number.isSafeInteger(userId) || userId < 1) {
      setError('Saisis un ID utilisateur entier positif.')
      return
    }

    setIsManagingMembers(true)
    setError('')
    try {
      const token = await getToken()
      if (!token) throw new Error('Connexion Clerk nécessaire')
      const response = await fetch(
        `${backendUrl}/api/groups/${group.id}/members/`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ user_id: userId }),
        },
      )
      if (!response.ok) throw new Error('Impossible d’ajouter ce membre.')
      const updatedGroup = (await response.json()) as ChatGroup
      onGroupUpdated(updatedGroup)
      setMemberId('')
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Impossible d’ajouter ce membre.',
      )
    } finally {
      setIsManagingMembers(false)
    }
  }

  async function removeMember(userId: number) {
    setIsManagingMembers(true)
    setError('')
    try {
      const token = await getToken()
      if (!token) throw new Error('Connexion Clerk nécessaire')
      const response = await fetch(
        `${backendUrl}/api/groups/${group.id}/members/${userId}/`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        },
      )
      if (!response.ok) throw new Error('Impossible de supprimer ce membre.')
      const refreshed = await fetch(
        `${backendUrl}/api/conversations/${conversationId}/`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      if (!refreshed.ok) {
        throw new Error('Membre supprimé, mais actualisation impossible.')
      }
      const conversation = (await refreshed.json()) as { group: ChatGroup }
      onGroupUpdated(conversation.group)
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Impossible de supprimer ce membre.',
      )
    } finally {
      setIsManagingMembers(false)
    }
  }

  async function changeMemberRole(userId: number, role: 'admin' | 'member') {
    setIsManagingMembers(true)
    setError('')
    try {
      const token = await getToken()
      if (!token) throw new Error('Connexion Clerk nécessaire')
      const response = await fetch(
        `${backendUrl}/api/groups/${group.id}/members/${userId}/role/`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ role }),
        },
      )
      if (!response.ok) throw new Error('Impossible de modifier le rôle.')
      onGroupUpdated((await response.json()) as ChatGroup)
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Impossible de modifier le rôle.',
      )
    } finally {
      setIsManagingMembers(false)
    }
  }

  return (
    <aside className="chat-members-panel" aria-label="Membres du groupe">
      <div className="chat-members-heading">
        <div>
          <h2>{group.name || 'Membres'}</h2>
          <p>
            Votre rôle :{' '}
            {currentRole === 'owner'
              ? 'Propriétaire'
              : currentRole === 'admin'
                ? 'Administrateur'
                : 'Membre'}
          </p>
        </div>
      </div>
      {error && (
        <p className="chat-members-error" role="alert">
          {error}
        </p>
      )}
      {(currentRole === 'owner' || currentRole === 'admin') && (
        <form className="chat-add-member" onSubmit={addMember}>
          <label htmlFor="new-member-id">Ajouter un membre (ID utilisateur)</label>
          <div>
            <input
              id="new-member-id"
              inputMode="numeric"
              value={memberId}
              onChange={(event) => setMemberId(event.target.value)}
              placeholder="ID utilisateur"
              disabled={isManagingMembers}
            />
            <button type="submit" disabled={isManagingMembers}>
              Ajouter
            </button>
          </div>
        </form>
      )}
      <ul className="chat-members-list">
        {group.members.map(({ user, role }) => (
          <li key={user.id}>
            <span>{user.username}</span>
            <span className={`chat-member-role chat-member-role-${role}`}>
              {role === 'owner'
                ? 'Propriétaire'
                : role === 'admin'
                  ? 'Admin'
                  : 'Membre'}
            </span>
            {currentRole === 'owner' && role !== 'owner' && (
              <select
                aria-label={`Rôle de ${user.username}`}
                value={role}
                disabled={isManagingMembers}
                onChange={(event) =>
                  void changeMemberRole(
                    user.id,
                    event.target.value as 'admin' | 'member',
                  )
                }
              >
                <option value="member">Membre</option>
                <option value="admin">Admin</option>
              </select>
            )}
            {((currentRole === 'owner' && role !== 'owner') ||
              (currentRole === 'admin' && role === 'member')) && (
              <button
                type="button"
                className="chat-remove-member"
                disabled={isManagingMembers}
                onClick={() => void removeMember(user.id)}
              >
                Retirer
              </button>
            )}
          </li>
        ))}
      </ul>
    </aside>
  )
}

export default MembershipPanel
