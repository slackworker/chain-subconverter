import { useState } from "react";
import {
	DndContext,
	DragOverlay,
	KeyboardSensor,
	PointerSensor,
	closestCenter,
	type DragEndEvent,
	type DragStartEvent,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import { restrictToVerticalAxis, restrictToParentElement } from "@dnd-kit/modifiers";
import {
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { GripHorizontalIcon } from "./Icons";
import type { Stage2Copy } from "./Stage2RowCells";

type MemberOrderItem = { rowId: string; displayName: string; isSource: boolean };

interface Stage2MemberOrderListProps {
	canManageOrder: boolean;
	copy: Stage2Copy;
	members: MemberOrderItem[];
	onMemberMoveTo: (memberRowId: string, toIndex: number) => void;
}

function MemberOrderOverlayItem({ index, member }: { index: number; member: MemberOrderItem }) {
	return (
		<div className="a-member-order__item a-member-order__item--overlay">
			<div className={`a-member-order__summary${index === 0 ? " a-member-order__summary--primary" : ""}`}>
				<span className="a-member-order__name">{member.displayName}</span>
			</div>
			<span className="a-member-order__drag-handle a-member-order__drag-handle--visual" aria-hidden="true">
				<GripHorizontalIcon className="a-member-order__drag-icon" aria-hidden="true" />
			</span>
		</div>
	);
}

interface SortableMemberOrderItemProps {
	canManageOrder: boolean;
	copy: Stage2Copy;
	index: number;
	member: MemberOrderItem;
}

function SortableMemberOrderItem({ canManageOrder, copy, index, member }: SortableMemberOrderItemProps) {
	const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
		id: member.rowId,
		disabled: !canManageOrder,
	});

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
		opacity: isDragging ? 0.22 : 1,
	};

	return (
		<li
			ref={setNodeRef}
			style={style}
			className={`a-member-order__item${isDragging ? " a-member-order__item--sortable-placeholder" : ""}`}
		>
			<div className={`a-member-order__summary${index === 0 ? " a-member-order__summary--primary" : ""}`}>
				<span className="a-member-order__name">{member.displayName}</span>
			</div>
			<button
				type="button"
				ref={setActivatorNodeRef}
				className="a-member-order__drag-handle"
				disabled={!canManageOrder}
				aria-label={copy.memberOrderDragHandleAria.replace("{name}", member.displayName)}
				title={copy.memberOrderDragHandle}
				{...attributes}
				{...listeners}
			>
				<GripHorizontalIcon className="a-member-order__drag-icon" aria-hidden="true" />
			</button>
		</li>
	);
}

export function Stage2MemberOrderList({
	canManageOrder,
	copy,
	members,
	onMemberMoveTo,
}: Stage2MemberOrderListProps) {
	const [activeMemberId, setActiveMemberId] = useState<string | null>(null);
	const sensors = useSensors(
		useSensor(PointerSensor, {
			activationConstraint: { distance: 4 },
		}),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	const activeMember = activeMemberId
		? members.find((member) => member.rowId === activeMemberId) ?? null
		: null;
	const activeMemberIndex = activeMember
		? members.findIndex((member) => member.rowId === activeMember.rowId)
		: -1;

	function handleDragStart(event: DragStartEvent) {
		setActiveMemberId(String(event.active.id));
	}

	function handleDragEnd(event: DragEndEvent) {
		const { active, over } = event;
		setActiveMemberId(null);
		if (!over || active.id === over.id) {
			return;
		}
		const fromIndex = members.findIndex((member) => member.rowId === active.id);
		const toIndex = members.findIndex((member) => member.rowId === over.id);
		if (fromIndex < 0 || toIndex < 0) {
			return;
		}
		onMemberMoveTo(String(active.id), toIndex);
	}

	return (
		<DndContext
			sensors={sensors}
			collisionDetection={closestCenter}
			modifiers={[restrictToVerticalAxis, restrictToParentElement]}
			onDragStart={handleDragStart}
			onDragEnd={handleDragEnd}
			onDragCancel={() => setActiveMemberId(null)}
		>
			<SortableContext items={members.map((member) => member.rowId)} strategy={verticalListSortingStrategy}>
				<ul className="a-member-order__list">
					{members.map((member, index) => (
						<SortableMemberOrderItem
							key={member.rowId}
							canManageOrder={canManageOrder}
							copy={copy}
							index={index}
							member={member}
						/>
					))}
				</ul>
			</SortableContext>
			<DragOverlay dropAnimation={{ duration: 220, easing: "cubic-bezier(0.18, 0.67, 0.32, 1)" }}>
				{activeMember && activeMemberIndex >= 0 ? (
					<MemberOrderOverlayItem index={activeMemberIndex} member={activeMember} />
				) : null}
			</DragOverlay>
		</DndContext>
	);
}
